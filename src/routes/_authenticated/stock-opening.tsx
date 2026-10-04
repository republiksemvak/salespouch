import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, Boxes, Check, ChevronRight, Edit3, RefreshCw, Save, Sparkles, Store, Warehouse, X } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { useProducts } from "@/lib/products";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/stock-opening")({ head: () => ({ meta: [{ title: "Stok Pembukaan — Sales Pouch" }] }), component: OpeningStockPage });
type SetupMode = "migration" | "from_start";
type Setup = { id: string; mode: SetupMode; status: "active" | "finalized" };
type Location = { id: string; name: string; location_type: "warehouse" | "outlet" | "sales" };
type Opening = { location_id: string; product_id: string; quantity: number };

function OpeningStockPage() {
  const { data: account, isLoading: accountLoading } = useProfile();
  const { data: products = [] } = useProducts();
  const qc = useQueryClient();
  const [savingMode, setSavingMode] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState("");
  const [qty, setQty] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const { data: setup, isLoading: setupLoading } = useQuery<Setup | null>({
    queryKey: ["stock-setup", account?.ownerId], enabled: !!account?.ownerId,
    queryFn: async () => { const { data, error } = await (supabase as any).from("stock_setups").select("id,mode,status").eq("owner_id", account!.ownerId).maybeSingle(); if (error) throw error; return data; },
  });
  const { data: locations = [], isLoading: locationsLoading } = useQuery<Location[]>({
    queryKey: ["stock-locations", account?.ownerId], enabled: !!account?.ownerId && !!setup,
    queryFn: async () => { const { data, error } = await (supabase as any).from("stock_locations").select("id,name,location_type").eq("owner_id", account!.ownerId).eq("is_active", true).order("location_type").order("name"); if (error) throw error; return data ?? []; },
  });
  const { data: outlets = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["stock-opening-outlets"], enabled: !!setup,
    queryFn: async () => { const { data, error } = await supabase.from("outlets").select("id,name").order("name"); if (error) throw error; return data ?? []; },
  });
  const { data: sales = [] } = useQuery<{ user_id: string }[]>({
    queryKey: ["stock-opening-sales", account?.ownerId], enabled: !!account?.ownerId && !!setup,
    queryFn: async () => { const { data, error } = await (supabase as any).from("team_members").select("user_id").eq("owner_id", account!.ownerId).eq("position", "sales"); if (error) throw error; return data ?? []; },
  });
  const { data: openings = [] } = useQuery<Opening[]>({
    queryKey: ["stock-openings", setup?.id], enabled: !!setup?.id,
    queryFn: async () => { const { data, error } = await (supabase as any).from("stock_opening_items").select("location_id,product_id,quantity").eq("setup_id", setup!.id); if (error) throw error; return data ?? []; },
  });

  const locationSummary = useMemo(() => locations.map((l) => ({ ...l, count: openings.filter((x) => x.location_id === l.id && Number(x.quantity) > 0).length })), [locations, openings]);

  async function prepareLocations() {
    if (!account?.ownerId || preparing) return; setPreparing(true);
    try {
      if (!locations.some((x) => x.location_type === "warehouse")) {
        const { error } = await (supabase as any).from("stock_locations").insert({ owner_id: account.ownerId, location_type: "warehouse", name: "Gudang Utama" }); if (error) throw error;
      }
      const currentOutlets = new Set((locations as any).filter((x: any) => x.location_type === "outlet").map((x: any) => x.id));
      const existingOutletIds = new Set((locations as any).filter((x: any) => x.location_type === "outlet").map((x: any) => x.outlet_id));
      const missingOutlets = outlets.filter((o) => !existingOutletIds.has(o.id) && !currentOutlets.has(o.id));
      if (missingOutlets.length) { const { error } = await (supabase as any).from("stock_locations").insert(missingOutlets.map((o) => ({ owner_id: account.ownerId, location_type: "outlet", name: o.name, outlet_id: o.id }))); if (error) throw error; }
      const existingSalesIds = new Set((locations as any).filter((x: any) => x.location_type === "sales").map((x: any) => x.team_member_user_id));
      const missingSales = sales.filter((s) => !existingSalesIds.has(s.user_id));
      if (missingSales.length) { const { error } = await (supabase as any).from("stock_locations").insert(missingSales.map((s) => ({ owner_id: account.ownerId, location_type: "sales", name: `Sales ${s.user_id.slice(0, 6)}`, team_member_user_id: s.user_id }))); if (error) throw error; }
      await qc.invalidateQueries({ queryKey: ["stock-locations", account.ownerId] }); toast.success("Lokasi stok sudah siap.");
    } catch (e) { toast.error(`Gagal menyiapkan lokasi: ${(e as Error).message}`); } finally { setPreparing(false); }
  }

  function startEdit(locationId?: string) {
    const id = locationId ?? locations[0]?.id ?? ""; setSelectedLocation(id);
    const next: Record<string, string> = {}; openings.filter((x) => x.location_id === id).forEach((x) => { next[x.product_id] = String(Number(x.quantity) || 0); });
    setQty(next); setEditing(true);
  }
  function cancelEdit() { setEditing(false); setSelectedLocation(""); setQty({}); }
  async function saveOpening() {
    if (!setup || !selectedLocation) return; setSaving(true);
    try {
      const { error: delError } = await (supabase as any).from("stock_opening_items").delete().eq("setup_id", setup.id).eq("location_id", selectedLocation); if (delError) throw delError;
      const rows = products.map((p: any) => ({ setup_id: setup.id, owner_id: account!.ownerId, location_id: selectedLocation, product_id: p.id, quantity: Math.max(0, Number(qty[p.id] || 0)) })).filter((x: any) => x.quantity > 0);
      if (rows.length) { const { error } = await (supabase as any).from("stock_opening_items").insert(rows); if (error) throw error; }
      await qc.invalidateQueries({ queryKey: ["stock-openings", setup.id] }); toast.success("Stok pembukaan berhasil disimpan."); cancelEdit();
    } catch (e) { toast.error(`Gagal menyimpan: ${(e as Error).message}`); } finally { setSaving(false); }
  }
  async function chooseMode(mode: SetupMode) {
    if (!account?.ownerId || savingMode) return; setSavingMode(true);
    try { const { data, error } = await (supabase as any).from("stock_setups").insert({ owner_id: account.ownerId, mode, status: "active" }).select("id,mode,status").single(); if (error) throw error; qc.setQueryData(["stock-setup", account.ownerId], data); toast.success("Mode stok disimpan."); }
    catch (e) { toast.error(`Gagal menyimpan: ${(e as Error).message}`); } finally { setSavingMode(false); }
  }

  if (accountLoading || setupLoading) return <main className="mx-auto max-w-md px-4 pt-12 text-center text-sm text-muted-foreground">Memuat pengaturan stok…</main>;
  if (account?.role !== "owner") return <main className="mx-auto max-w-md px-4 pt-12 text-center text-destructive">Hanya Owner yang dapat mengatur stok pembukaan.</main>;

  return <main className="mx-auto min-h-screen max-w-md px-4 pb-10 pt-5">
    <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" /> Kembali ke Dashboard</Link>
    <header className="mt-5 flex items-start gap-3"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-orange-100 text-orange-700"><Boxes className="h-6 w-6" /></div><div><h1 className="text-2xl font-bold tracking-tight">Stok Pembukaan</h1><p className="mt-1 text-sm text-muted-foreground">Isi stok awal per lokasi. Selama belum final, data masih bisa diedit.</p></div></header>

    {!setup ? <div className="mt-6 space-y-3"><section className="rounded-2xl border bg-card p-4"><div className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-orange-600" /> Bagaimana ingin memulai?</div><p className="mt-2 text-xs text-muted-foreground">Pilihan ini menjadi dasar pencatatan stok awal.</p></section><button type="button" disabled={savingMode} onClick={() => chooseMode("migration")} className="w-full rounded-2xl border bg-card p-4 text-left shadow-sm"><div className="flex gap-3"><div className="rounded-xl bg-orange-100 p-3 text-orange-700"><RefreshCw className="h-5 w-5" /></div><div className="flex-1"><b>Usaha sudah berjalan</b><p className="mt-1 text-xs text-muted-foreground">Migrasi Usaha — isi stok secara bertahap sambil tetap beroperasi.</p></div><ChevronRight /></div></button><button type="button" disabled={savingMode} onClick={() => chooseMode("from_start")} className="w-full rounded-2xl border bg-card p-4 text-left shadow-sm"><div className="flex gap-3"><div className="rounded-xl bg-emerald-100 p-3 text-emerald-700"><Warehouse className="h-5 w-5" /></div><div className="flex-1"><b>Usaha baru / mulai dari awal</b><p className="mt-1 text-xs text-muted-foreground">Masukkan seluruh stok awal sebelum mulai berjalan.</p></div><ChevronRight /></div></button></div> : <>
      <section className="mt-6 rounded-2xl border bg-card p-4"><div className="flex items-center gap-2"><Check className="h-5 w-5 text-emerald-600" /><div><div className="text-xs text-muted-foreground">Mode aktif</div><b>{setup.mode === "migration" ? "Migrasi Usaha" : "Mulai dari Awal"}</b></div></div><div className="mt-3 rounded-xl bg-muted/60 p-3 text-xs">Status: <b>{setup.status === "active" ? "Aktif — masih bisa diedit" : "Final — terkunci"}</b></div></section>
      {locations.length === 0 && <section className="mt-4 rounded-2xl border bg-card p-4"><div className="flex items-center gap-2 text-sm font-semibold"><Warehouse className="h-4 w-4" /> Siapkan lokasi stok</div><p className="mt-1 text-xs text-muted-foreground">Sales Pouch akan membuat Gudang Utama dan menyiapkan lokasi Toko serta Sales yang tersedia.</p><Button className="mt-3 w-full rounded-xl" onClick={prepareLocations} disabled={preparing || locationsLoading}>{preparing ? "Menyiapkan…" : "Siapkan Lokasi Stok"}</Button></section>}
      {locations.length > 0 && !editing && <section className="mt-4 rounded-2xl border bg-card p-4"><div className="flex items-center justify-between"><div><b className="text-sm">Stok per lokasi</b><p className="text-xs text-muted-foreground">Klik Edit untuk memperbaiki input yang salah.</p></div><span className="text-xs text-muted-foreground">{openings.length} item</span></div><div className="mt-3 space-y-2">{locationSummary.map((l) => <div key={l.id} className="flex items-center justify-between rounded-xl border p-3"><div className="flex min-w-0 items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">{l.location_type === "warehouse" ? <Warehouse className="h-4 w-4" /> : l.location_type === "outlet" ? <Store className="h-4 w-4" /> : <Boxes className="h-4 w-4" />}</div><div className="min-w-0"><div className="truncate text-sm font-medium">{l.name}</div><div className="text-[10px] text-muted-foreground">{l.location_type === "warehouse" ? "Gudang" : l.location_type === "outlet" ? "Toko" : "Sales"} · {l.count} produk terisi</div></div></div>{setup.status === "active" && <Button variant="outline" size="sm" onClick={() => startEdit(l.id)}><Edit3 className="mr-1 h-3.5 w-3.5" /> Edit</Button>}</div>)}</div><Button variant="outline" className="mt-3 w-full rounded-xl" disabled={setup.status !== "active"} onClick={() => startEdit()}><Edit3 className="mr-2 h-4 w-4" /> Isi / Edit Stok Pembukaan</Button></section>}
      {locations.length > 0 && editing && <section className="mt-4 rounded-2xl border bg-card p-4"><div className="flex items-center justify-between gap-3"><div><b className="text-sm">Edit Stok Pembukaan</b><p className="text-xs text-muted-foreground">Koreksi jumlah fisik. Simpan untuk memperbarui.</p></div><Button variant="ghost" size="sm" onClick={cancelEdit}><X className="mr-1 h-4 w-4" /> Batal</Button></div><select value={selectedLocation} onChange={(e) => startEdit(e.target.value)} className="mt-3 h-11 w-full rounded-md border bg-background px-3 text-sm">{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select><div className="mt-3 space-y-2">{products.map((p: any) => <div key={p.id} className="flex items-center gap-2 rounded-xl border p-2.5"><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{p.name}</div><div className="text-[10px] text-muted-foreground">Isi 0 jika tidak ada</div></div><Input type="number" min={0} step={1} inputMode="numeric" value={qty[p.id] ?? "0"} onChange={(e) => setQty((prev) => ({ ...prev, [p.id]: e.target.value }))} className="h-10 w-24 text-right" /></div>)}</div><div className="mt-4 flex gap-2"><Button variant="outline" className="flex-1 rounded-xl" onClick={cancelEdit}><X className="mr-2 h-4 w-4" /> Batal</Button><Button className="flex-1 rounded-xl" disabled={saving} onClick={saveOpening}><Save className="mr-2 h-4 w-4" />{saving ? "Menyimpan…" : "Simpan Stok"}</Button></div><p className="mt-3 text-center text-[10px] text-muted-foreground">Salah input tidak masalah: edit angka lalu simpan lagi.</p></section>}
    </>}
  </main>;
}
