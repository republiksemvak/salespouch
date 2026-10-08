import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, UserMinus, ShieldCheck, Package } from "lucide-react";
import { toast } from "sonner";
import { useProfile } from "@/hooks/use-profile";
import { supabase } from "@/integrations/supabase/client";
import { useProducts } from "@/lib/products";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { listTeam, createSales, removeSales } from "@/lib/team.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/team")({
  head: () => ({ meta: [{ title: "Manajemen Tim — Sales Pouch" }, { name: "description", content: "Kelola Admin, Manager dan Sales usaha Anda." }] }),
  component: TeamPage,
});

function TeamPage() {
  const { data: profile, isLoading: profileLoading } = useProfile();
  const { data: isAdmin, isLoading: adminLoading } = useIsAdmin();
  const owner = profile?.role === "owner";
  const manager = profile?.role === "manager";
  const admin = profile?.role === "admin";
  const superAdmin = !!isAdmin;
  const canManage = owner || manager || admin || superAdmin;
  const fetchTeam = useServerFn(listTeam);
  const create = useServerFn(createSales);
  const remove = useServerFn(removeSales);
  const qc = useQueryClient();
  const { data: products = [] } = useProducts();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [position, setPosition] = useState<"admin" | "manager" | "sales">("sales");
  const [managerId, setManagerId] = useState("");
  const [busy, setBusy] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const activeOwnerId = profile?.ownerId;
  const { data: members, error } = useQuery({
    queryKey: ["team", activeOwnerId],
    enabled: !profileLoading && !adminLoading && !!canManage,
    queryFn: () => fetchTeam({ data: {} }),
  });

  const managers = useMemo(() => (members ?? []).filter((member) => member.position === "manager"), [members]);\n\n  const salesMembers = useMemo(() => (members ?? []).filter((member) => member.position === "sales"), [members]);

  const { data: salesStock = {} } = useQuery<Record<string, { total: number; items: { name: string; qty: number }[] }>>({
    queryKey: ["team-sales-current-stock", activeOwnerId, salesMembers.map((m) => m.user_id).join(",")],
    enabled: !!activeOwnerId && salesMembers.length > 0,
    queryFn: async () => {
      const rows = await Promise.all(
        salesMembers.map(async (member) => {
          const { data, error } = await (supabase as any).rpc("get_sales_current_stock", {
            _sales_user_id: member.user_id,
          });
          if (error) throw error;
          const items = ((data ?? []) as { product_id: string; quantity: number }[])
            .map((row) => ({
              name: products.find((p) => p.id === row.product_id)?.name ?? "Produk",
              qty: Number(row.quantity) || 0,
            }))
            .filter((row) => row.qty > 0)
            .sort((a, b) => b.qty - a.qty);
          return [member.user_id, { total: items.reduce((sum, item) => sum + item.qty, 0), items }] as const;
        }),
      );
      return Object.fromEntries(rows);
    },
    staleTime: 5_000,
  });

  if (profileLoading || adminLoading) return <div className="p-10 text-center">Memuat…</div>;
  if (!canManage) return <div className="p-10 text-center text-destructive">Hanya Owner, Admin atau Manager yang dapat mengelola tim.</div>;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const finalPosition = manager ? "sales" : position;
    try {
      await create({ data: { name, username, password, position: finalPosition, managerId: finalPosition === "sales" ? (manager ? null : (managerId || null)) : null } });
      setName(""); setUsername(""); setPassword(""); setManagerId("");
      toast.success(`${finalPosition === "admin" ? "Admin" : finalPosition === "manager" ? "Manager" : "Sales"} berhasil dibuat`);
      qc.invalidateQueries({ queryKey: ["team", activeOwnerId] });
      setShowCreateForm(false);
    } catch (err) { toast.error((err as Error).message); }
    finally { setBusy(false); }
  }

  const roleLabel = position === "admin" ? "Admin" : position === "manager" ? "Manager" : "Sales";

  return <main className="mx-auto min-h-screen max-w-md px-5 pb-10 pt-6">
    <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" />Kembali</Link>
    <div className="mt-4 flex items-start justify-between gap-3"><div><h1 className="text-2xl font-bold">Manajemen Tim</h1><p className="mt-1 text-sm text-muted-foreground">Owner → Admin / Manager → Sales</p></div>{owner && <Button asChild variant="outline" className="shrink-0"><Link to="/team-access"><ShieldCheck className="mr-2 h-4 w-4" />Atur Akses</Link></Button>}</div>

    <Button
      type="button"
      onClick={() => setShowCreateForm((open) => !open)}
      className="mt-6 h-12 w-full"
    >
      {showCreateForm ? "Tutup Form" : "Buat Akun Sales"}
    </Button>

    {showCreateForm && (
      <form onSubmit={add} className="mt-4 space-y-3 rounded-lg border bg-card p-4">
        <div>
          <h2 className="text-sm font-semibold">Buat Akun</h2>
          <p className="mt-1 text-xs text-muted-foreground">Isi data akun baru untuk anggota tim.</p>
        </div>

        <label className="text-sm font-medium">Jabatan</label>
        <select value={manager ? "sales" : position} onChange={(e) => setPosition(e.target.value as "admin" | "manager" | "sales")} disabled={manager} className="h-12 w-full rounded-md border bg-background px-3 text-sm">
          <option value="sales">Sales</option>
          {!manager && <option value="manager">Manager</option>}
          {owner && <option value="admin">Admin</option>}
        </select>

        <label className="text-sm font-medium">Nama {manager ? "Sales" : roleLabel}</label>
        <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder={position === "manager" && !manager ? "Andi" : position === "admin" ? "Citra" : "Budi"} className="h-12" />
        <label className="text-sm font-medium">Username</label>
        <Input required minLength={3} maxLength={30} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="budi.sales" className="h-12" />
        <label className="text-sm font-medium">Password</label>
        <Input required minLength={6} maxLength={72} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimal 6 karakter" className="h-12" />

        {!manager && position === "sales" && <>
          <label className="text-sm font-medium">Manager (opsional)</label>
          <select value={managerId} onChange={(e) => setManagerId(e.target.value)} className="h-12 w-full rounded-md border bg-background px-3 text-sm">
            <option value="">Tanpa Manager — langsung di bawah Owner</option>
            {managers.map((member) => {
              const p = member.profiles as { display_name?: string; username?: string } | null;
              return <option key={member.user_id} value={member.user_id}>{p?.display_name ?? p?.username ?? "Manager"}</option>;
            })}
          </select>
        </>}

        <Button disabled={busy} className="h-12 w-full">{busy ? "Membuat akun…" : `Buat Akun ${manager ? "Sales" : roleLabel}`}</Button>
      </form>
    )}

    <h2 className="mt-8 text-sm font-semibold">Struktur tim ({members?.length ?? 0})</h2>
    {error && <p className="mt-3 text-sm text-destructive">Daftar tim tidak dapat dimuat.</p>}
    <div className="mt-3 space-y-2">
      {(members ?? []).map((member) => {
        const p = member.profiles as { user_email?: string; username?: string; display_name?: string } | null;
        const managerProfile = member.manager as { display_name?: string; username?: string } | null;
        const isOwn = member.user_id === profile?.userId;
        const canRemove = !isOwn && (owner || superAdmin || (manager && member.position === "sales" && member.manager_id === profile?.userId));
        const positionLabel = member.position === "admin" ? "admin" : member.position;
        return <div key={member.user_id} className={`flex items-center justify-between gap-3 rounded border bg-card p-3 ${member.position === "sales" && member.manager_id ? "ml-5" : ""}`}>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 truncate text-sm font-medium"><span>{p?.display_name ?? p?.username ?? p?.user_email ?? "Karyawan"}</span><span className="rounded bg-muted px-2 py-0.5 text-[10px] font-medium uppercase">{positionLabel}</span></div>
            <div className="truncate text-xs text-muted-foreground">{p?.username ? `@${p.username}` : ""}{member.position === "sales" && managerProfile ? ` · Manager: ${managerProfile.display_name ?? managerProfile.username ?? "Manager"}` : ""}</div>
            {member.position === "sales" && (
              <div className="mt-2 flex items-start gap-2 rounded-lg bg-blue-50/70 px-2.5 py-2 text-[11px] text-blue-900">
                <Package className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <div className="min-w-0">
                  <div className="font-semibold">
                    Stok dibawa: {salesStock[member.user_id] ? `${salesStock[member.user_id].total} pcs` : "Memuat…"}
                  </div>
                  {salesStock[member.user_id]?.items.length ? (
                    <div className="mt-0.5 truncate text-[10px] text-blue-800/80">
                      {salesStock[member.user_id].items.map((item) => `${item.name} ${item.qty} pcs`).join(" · ")}
                    </div>
                  ) : salesStock[member.user_id] ? (
                    <div className="mt-0.5 text-[10px] text-blue-800/80">Tidak ada stok di tangan</div>
                  ) : null}
                </div>
              </div>
            )}
          </div>
          {canRemove && <Button variant="ghost" size="icon" aria-label="Keluarkan karyawan" title="Keluarkan dari tim" onClick={async () => { if (!confirm("Keluarkan karyawan dari tim?")) return; try { await remove({ data: { userId: member.user_id } }); qc.invalidateQueries({ queryKey: ["team", activeOwnerId] }); toast.success("Karyawan dikeluarkan"); } catch (err) { toast.error((err as Error).message); } }}><UserMinus className="h-4 w-4" /></Button>}
        </div>;
      })}
    </div>
  </main>;
}
