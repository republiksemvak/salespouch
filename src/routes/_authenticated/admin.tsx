import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Search, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { accessStatus, type Profile } from "@/lib/access";
import { setUserLicense } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Super Admin — Sales Pouch" }, { name: "description", content: "Kelola pengguna, lisensi, paket dan promo." }, { property: "og:title", content: "Super Admin — Sales Pouch" }, { property: "og:description", content: "Kelola pengguna, lisensi, paket dan promo." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: AdminPage,
});

const fmt = (d: Date | string) => new Date(d).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
const statusLabel: Record<string, string> = { bypass: "Bebas akses", license: "Lisensi aktif", trial: "Trial", expired: "Kedaluwarsa" };

function AdminPage() {
  const { data: isAdmin, isLoading } = useIsAdmin();
  if (isLoading) return <div className="p-10 text-center text-muted-foreground">Memuat…</div>;
  if (!isAdmin) return <div className="p-10 text-center text-destructive">Halaman ini khusus super admin.</div>;
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-5 pb-16 pt-6">
      <Link to="/dashboard" className="flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" />Kembali</Link>
      <h1 className="mt-2 text-2xl font-bold">Dashboard Super Admin</h1>
      <Tabs defaultValue="users" className="mt-5">
        <TabsList className="grid w-full grid-cols-3"><TabsTrigger value="users">Pengguna</TabsTrigger><TabsTrigger value="packages">Paket</TabsTrigger><TabsTrigger value="promos">Promo</TabsTrigger></TabsList>
        <TabsContent value="users"><Users /></TabsContent>
        <TabsContent value="packages"><Packages /></TabsContent>
        <TabsContent value="promos"><Promos /></TabsContent>
      </Tabs>
    </main>
  );
}

function Users() {
  const qc = useQueryClient();
  const setLicense = useServerFn(setUserLicense);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const { data: users } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Profile[];
    },
  });
  const { data: pkgs } = useQuery({
    queryKey: ["admin-packages"],
    queryFn: async () => (await supabase.from("license_packages").select("*").order("days")).data ?? [],
  });
  async function apply(userId: string, input: { mode: "add" | "set" | "revoke"; days?: number; until?: string }) {
    try {
      await setLicense({ data: { userId, ...input } });
      toast.success("Lisensi diperbarui");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (e) { toast.error((e as Error).message); }
  }
  const rows = (users ?? []).map((u) => ({ u, s: accessStatus(u) }))
    .filter(({ u, s }) => (filter === "all" || s.reason === filter) &&
      `${u.user_email ?? ""} ${u.business_name ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()));
  const count = (r: string) => (users ?? []).filter((u) => accessStatus(u).reason === r).length;

  return (
    <div className="mt-4 space-y-3">
      <div className="grid grid-cols-4 gap-2 text-center text-xs">
        {["trial", "license", "expired", "bypass"].map((r) => (
          <button key={r} onClick={() => setFilter(filter === r ? "all" : r)} className={`rounded-xl border p-2 ${filter === r ? "border-primary bg-primary/10" : "bg-card"}`}>
            <div className="text-lg font-bold">{count(r)}</div>{statusLabel[r]}
          </button>
        ))}
      </div>
      <div className="relative"><Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari email / nama usaha…" className="h-11 pl-9" /></div>
      <p className="text-xs text-muted-foreground">{rows.length} dari {users?.length ?? 0} pengguna</p>
      {rows.map(({ u, s }) => <UserRow key={u.id} u={u} s={s} pkgs={pkgs ?? []} apply={apply} />)}
    </div>
  );
}

function UserRow({ u, s, pkgs, apply }: { u: Profile; s: ReturnType<typeof accessStatus>; pkgs: { id: string; name: string; days: number }[]; apply: (id: string, i: { mode: "add" | "set" | "revoke"; days?: number; until?: string }) => Promise<void> }) {
  const [pkg, setPkg] = useState("");
  const [date, setDate] = useState("");
  const badge = s.reason === "expired" ? "bg-destructive/15 text-destructive" : s.reason === "trial" ? "bg-accent/20" : "bg-primary/15 text-primary";
  return (
    <div className="rounded-2xl border bg-card p-4 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-semibold">{u.business_name || "(belum isi nama usaha)"}</div>
          <div className="truncate text-xs text-muted-foreground">{u.user_email}</div>
          <div className="mt-1 text-xs text-muted-foreground">Daftar {fmt(u.created_at)}</div>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${badge}`}>{statusLabel[s.reason]}</span>
      </div>
      <div className="mt-2 text-xs">
        {s.reason === "trial" && s.trialEndsAt && <>Trial sampai <b>{fmt(s.trialEndsAt)}</b></>}
        {u.license_until && <>Lisensi sampai <b>{fmt(u.license_until)}</b></>}
      </div>
      {s.reason !== "bypass" && (
        <div className="mt-3 flex flex-wrap gap-2">
          <select value={pkg} onChange={(e) => setPkg(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
            <option value="">Pilih paket…</option>
            {pkgs.map((p) => <option key={p.id} value={p.days}>{p.name} (+{p.days} hari)</option>)}
          </select>
          <Button size="sm" disabled={!pkg} onClick={() => apply(u.id, { mode: "add", days: Number(pkg) })}>Tambah</Button>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 w-40" />
          <Button size="sm" variant="outline" disabled={!date} onClick={() => apply(u.id, { mode: "set", until: `${date}T23:59:59` })}>Set tanggal</Button>
          {u.license_until && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => confirm("Cabut lisensi?") && apply(u.id, { mode: "revoke" })}>Cabut</Button>}
        </div>
      )}
    </div>
  );
}

function Packages() {
  const qc = useQueryClient();
  const [f, setF] = useState({ name: "", days: "", price: "" });
  const { data } = useQuery({ queryKey: ["admin-packages"], queryFn: async () => (await supabase.from("license_packages").select("*").order("days")).data ?? [] });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-packages"] });
  async function add(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("license_packages").insert({ name: f.name.trim(), days: Number(f.days), price: Number(f.price) || 0 });
    if (error) { toast.error(error.message); return; }
    setF({ name: "", days: "", price: "" }); refresh();
  }
  return (
    <div className="mt-4 space-y-3">
      <form onSubmit={add} className="grid grid-cols-[1fr_80px_110px_auto] gap-2">
        <Input required placeholder="Nama paket" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <Input required type="number" min={1} placeholder="Hari" value={f.days} onChange={(e) => setF({ ...f, days: e.target.value })} />
        <Input type="number" min={0} placeholder="Harga" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} />
        <Button>Tambah</Button>
      </form>
      {data?.map((p) => (
        <div key={p.id} className="flex items-center justify-between rounded-xl border bg-card px-4 py-3 text-sm">
          <div><b>{p.name}</b> · {p.days} hari · Rp {Number(p.price).toLocaleString("id-ID")}{!p.active && <span className="ml-2 text-xs text-muted-foreground">(nonaktif)</span>}</div>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" onClick={async () => { await supabase.from("license_packages").update({ active: !p.active }).eq("id", p.id); refresh(); }}>{p.active ? "Nonaktifkan" : "Aktifkan"}</Button>
            <Button size="icon" variant="ghost" onClick={async () => { if (confirm("Hapus paket?")) { await supabase.from("license_packages").delete().eq("id", p.id); refresh(); } }}><Trash2 className="h-4 w-4" /></Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function Promos() {
  const qc = useQueryClient();
  const [f, setF] = useState({ code: "", description: "", discount: "", bonus: "", until: "" });
  const { data } = useQuery({ queryKey: ["admin-promos"], queryFn: async () => (await supabase.from("promos").select("*").order("created_at", { ascending: false })).data ?? [] });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-promos"] });
  async function add(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("promos").insert({
      code: f.code.trim().toUpperCase(), description: f.description.trim() || null,
      discount_percent: Number(f.discount) || 0, bonus_days: Number(f.bonus) || 0,
      valid_until: f.until ? new Date(`${f.until}T23:59:59`).toISOString() : null,
    });
    if (error) { toast.error(error.message); return; }
    setF({ code: "", description: "", discount: "", bonus: "", until: "" }); refresh();
  }
  return (
    <div className="mt-4 space-y-3">
      <form onSubmit={add} className="grid grid-cols-2 gap-2">
        <Input required placeholder="Kode promo" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} />
        <Input placeholder="Keterangan" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <Input type="number" min={0} max={100} placeholder="Diskon %" value={f.discount} onChange={(e) => setF({ ...f, discount: e.target.value })} />
        <Input type="number" min={0} placeholder="Bonus hari" value={f.bonus} onChange={(e) => setF({ ...f, bonus: e.target.value })} />
        <Input type="date" value={f.until} onChange={(e) => setF({ ...f, until: e.target.value })} />
        <Button>Tambah Promo</Button>
      </form>
      {data?.map((p) => (
        <div key={p.id} className="flex items-center justify-between rounded-xl border bg-card px-4 py-3 text-sm">
          <div>
            <b className="font-mono">{p.code}</b> · {p.discount_percent}% · +{p.bonus_days} hari
            <div className="text-xs text-muted-foreground">{p.description} {p.valid_until ? `· s/d ${fmt(p.valid_until)}` : "· tanpa batas"}{!p.active && " · nonaktif"}</div>
          </div>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" onClick={async () => { await supabase.from("promos").update({ active: !p.active }).eq("id", p.id); refresh(); }}>{p.active ? "Nonaktifkan" : "Aktifkan"}</Button>
            <Button size="icon" variant="ghost" onClick={async () => { if (confirm("Hapus promo?")) { await supabase.from("promos").delete().eq("id", p.id); refresh(); } }}><Trash2 className="h-4 w-4" /></Button>
          </div>
        </div>
      ))}
    </div>
  );
}
