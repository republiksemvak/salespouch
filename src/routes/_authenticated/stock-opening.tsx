import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, Boxes, Check, Edit3, Package, RefreshCw, Save, Sparkles, Store, Users, Warehouse, X } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { useProducts } from "@/lib/products";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/stock-opening")({ head: () => ({ meta: [{ title: "Stok Awal — Sales Pouch" }] }), component: OpeningStockPage });
type SetupMode = "migration" | "from_start";
type Setup = { id: string; mode: SetupMode; status: "active" | "finalized" };
type Location = { id: string; name: string; location_type: "warehouse" | "outlet" | "sales"; outlet_id?: string | null; team_member_user_id?: string | null };
type Opening = { location_id: string; product_id: string; quantity: number };

function OpeningStockPage() {
  const { data: account, isLoading: accountLoading } = useProfile();
  const { data: products = [] } = useProducts();
  const qc = useQueryClient();
  const [savingMode, setSavingMode] = useState(false);
  const [pendingMode, setPendingMode] = useState<SetupMode | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState("");
  const [qty, setQty] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  const { data: setup, isLoading: setupLoading } = useQuery<Setup | null>({
    queryKey: ["stock-setup", account?.ownerId], enabled: !!account?.ownerId,
    queryFn: async () => { const { data, error } = await (supabase as any).from("stock_setups").select("id,mode,status").eq("owner_id", account!.ownerId).maybeSingle(); if (error) throw error; return data; },
  });
  const { data: locations = [], isLoading: locationsLoading } = useQuery<Location[]>({
    queryKey: ["stock-locations", account?.ownerId], enabled: !!account?.ownerId && !!setup,
    queryFn: async () => { const { data, error } = await (supabase as any).from("stock_locations").select("id,name,location_type,outlet_id,team_member_user_id").eq("owner_id", account!.ownerId).eq("is_active", true).order("location_type").order("name"); if (error) throw error; return data ?? []; },
  });
  const { data: outlets = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["stock-opening-outlets"], enabled: !!setup && setup.mode === "migration",
    queryFn: async () => { const { data, error } = await supabase.from("outlets").select("id,name").order("name"); if (error) throw error; return data ?? []; },
  });
  const { data: sales = [] } = useQuery<{ user_id: string; profiles: { display_name: string | null; username: string | null } | null }[]>({
    queryKey: ["stock-opening-sales", account?.ownerId], enabled: !!account?.ownerId && !!setup && setup.mode === "migration",
    queryFn: async () => { const { data, error } = await (supabase as any).from("team_members").select("user_id,profiles!team_members_user_id_fkey(display_name,username)").eq("owner_id", account!.ownerId).eq("position", "sales"); if (error) throw error; return data ?? []; },
  });
  const { data: openings = [] } = useQuery<Opening[]>({
    queryKey: ["stock-openings", setup?.id], enabled: !!setup?.id,
    queryFn: async () => { const { data, error } = await (supabase as any).from("stock_opening_items").select("location_id,product_id,quantity").eq("setup_id", setup!.id); if (error) throw error; return data ?? []; },
  });

  const locationSummary = useMemo(() => locations.map((l) => ({ ...l, count: openings.filter((x) => x.location_id === l.id && Number(x.quantity) > 0).length })), [locations, openings]);
  const warehouseLocations = useMemo(() => locations.filter((x) => x.location_type === "warehouse"), [locations]);
  const hasProducts = products.length > 0;
  const totalOpeningQty = useMemo(() => openings.reduce((sum, x) => sum + Math.max(0, Number(x.quantity) || 0), 0), [openings]);

  async function ensureOpeningWarehouse() {
    if (!account?.ownerId) return;
    const current = locations.find((x) => x.location_type === "warehouse");
    if (current) return;
    const { error } = await (supabase as any).from("stock_locations").insert({ owner_id: account.ownerId, location_type: "warehouse", name: "Gudang Utama" });
    if (error) throw error;
  }

  async function prepareLocations() {
    if (!account?.ownerId || preparing || !hasProducts) return; setPreparing(true);
    try {
      await ensureOpeningWarehouse();
      const currentOutlets = new Set((locations as any).filter((x: any) => x.location_type === "outlet").map((x: any) => x.id));
      const existingOutletIds = new Set((locations as any).filter((x: any) => x.location_type === "outlet").map((x: any) => x.outlet_id));
      const missingOutlets = outlets.filter((o) => !existingOutletIds.has(o.id) && !currentOutlets.has(o.id));
      if (missingOutlets.length) { const { error } = await (supabase as any).from("stock_locations").insert(missingOutlets.map((o) => ({ owner_id: account.ownerId, location_type: "outlet", name: o.name, outlet_id: o.id }))); if (error) throw error; }
      const existingSalesIds = new Set((locations as any).filter((x: any) => x.location_type === "sales").map((x: any) => x.team_member_user_id));
      const missingSales = sales.filter((s) => !existingSalesIds.has(s.user_id));
      if (missingSales.length) { const { error } = await (supabase as any).from("stock_locations").insert(missingSales.map((s) => ({ owner_id: account.ownerId, location_type: "sales", name: s.profiles?.display_name?.trim() || s.profiles?.username?.trim() || "Sales", team_member_user_id: s.user_id }))); if (error) throw error; }
      await qc.invalidateQueries({ queryKey: ["stock-locations", account.ownerId] }); toast.success("Lokasi stok sudah siap.");
    } catch (e) { toast.error(`Gagal menyiapkan lokasi: ${(e as Error).message}`); } finally { setPreparing(false); }
  }

  function startEdit(locationId?: string) {
    const defaultId = setup?.mode === "from_start" ? warehouseLocations[0]?.id : locations[0]?.id;
    const id = locationId ?? defaultId ?? ""; setSelectedLocation(id);
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
      await qc.invalidateQueries({ queryKey: ["stock-openings", setup.id] }); toast.success("Stok awal berhasil disimpan."); cancelEdit();
    } catch (e) { toast.error(`Gagal menyimpan: ${(e as Error).message}`); } finally { setSaving(false); }
  }
  async function finalizeOpening() {
    if (!setup || setup.status !== "active" || editing || finalizing) return;
    if (!confirm(`Kunci Stok Awal?\n\nTotal stok yang tercatat: ${totalOpeningQty.toLocaleString("id-ID")} pcs.\n\nPastikan stok sudah diperiksa. Setelah dikunci, stok awal tidak lagi diedit dan perubahan berikutnya dicatat melalui transaksi stok.`)) return;
    setFinalizing(true);
    try {
      const { data, error } = await (supabase as any).from("stock_setups").update({ status: "finalized" }).eq("id", setup.id).eq("owner_id", account!.ownerId).select("id,mode,status").single();
      if (error) throw error;
      qc.setQueryData(["stock-setup", account!.ownerId], data);
      toast.success("Stok awal berhasil dikunci.");
    } catch (e) { toast.error(`Gagal mengunci stok awal: ${(e as Error).message}`); } finally { setFinalizing(false); }
  }
  async function chooseMode(mode: SetupMode) {
    if (!account?.ownerId || savingMode) return; setSavingMode(true);
    try {
      const { data, error } = await (supabase as any).from("stock_setups").insert({ owner_id: account.ownerId, mode, status: "active" }).select("id,mode,status").single(); if (error) throw error;
      qc.setQueryData(["stock-setup", account.ownerId], data); setPendingMode(null);
      if (mode === "from_start") {
        await ensureOpeningWarehouse();
        await qc.invalidateQueries({ queryKey: ["stock-locations", account.ownerId] });
        toast.success("Stok Gudang Awal siap diisi.");
      } else {
        toast.success("Migrasi stok awal siap diisi.");
      }
    } catch (e) { toast.error(`Gagal menyimpan: ${(e as Error).message}`); } finally { setSavingMode(false); }
  }

  if (accountLoading || setupLoading) return <main className="mx-auto max-w-md px-4 pt-12 text-center text-sm text-muted-foreground">Memuat stok awal…</main>;
  if (account?.role !== "owner") return <main className="mx-auto max-w-md px-4 pt-12 text-center text-destructive">Hanya Owner yang dapat mengatur stok awal.</main>;

  const isFromStart = setup?.mode === "from_start";

  return <main className="mx-auto min-h-screen max-w-md px-4 pb-10 pt-5">
    <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" /> Kembali ke Dashboard</Link>
    <header className="mt-5 flex items-start gap-3"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-orange-100 text-orange-700"><Boxes className="h-6 w-6" /></div><div><h1 className="text-2xl font-bold tracking-tight">Stok Awal</h1><p className="mt-1 text-sm text-muted-foreground">Tentukan stok yang menjadi titik awal penggunaan Sales Pouch.</p></div></header>

    {!setup ? <div className="mt-6 space-y-3">
      <section className="rounded-2xl border bg-card p-4"><div className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-orange-600" /> Pilih kondisi usaha</div><p className="mt-2 text-xs leading-5 text-muted-foreground">Usaha baru cukup mulai dari Gudang. Usaha yang sudah berjalan dapat memasukkan stok yang masih ada di Gudang, Toko, dan Sales.</p></section>
      <button type="button" disabled={savingMode} onClick={() => setPendingMode("from_start")} className="w-full rounded-2xl border bg-card p-4 text-left shadow-sm"><div className="flex gap-3"><div className="rounded-xl bg-emerald-100 p-3 text-emerald-700"><Warehouse className="h-5 w-5" /></div><div className="flex-1"><b>Usaha Baru</b><p className="mt-1 text-xs leading-5 text-muted-foreground">Isi stok yang tersedia di Gudang, lalu kunci dan mulai operasional.</p></div></div></button>
      <button type="button" disabled={savingMode} onClick={() => setPendingMode("migration")} className="w-full rounded-2xl border bg-card p-4 text-left shadow-sm"><div className="flex gap-3"><div className="rounded-xl bg-orange-100 p-3 text-orange-700"><RefreshCw className="h-5 w-5" /></div><div className="flex-1"><b>Usaha Sudah Berjalan</b><p className="mt-1 text-xs leading-5 text-muted-foreground">Masukkan stok sesuai kondisi sekarang, atau gunakan rekapan stok lama yang valid.</p></div></div></button>
      <Link to="/dashboard" className="block rounded-xl border px-4 py-3 text-center text-sm text-muted-foreground">Kembali ke Dashboard</Link>
    </div> : <>
      <section className="mt-6 rounded-2xl border bg-card p-4"><div className="flex items-center gap-3"><Check className="h-5 w-5 text-emerald-600" /><div><div className="text-xs text-muted-foreground">Kondisi usaha</div><b>{isFromStart ? "Usaha Baru" : "Usaha Sudah Berjalan — Migrasi"}</b></div></div><div className="mt-3 rounded-xl bg-muted/60 p-3 text-xs">Status stok awal: <b>{setup.status === "active" ? "masih bisa diisi dan diperiksa" : "sudah dikunci"}</b></div></section>

      {isFromStart ? <>
        <section className="mt-4 rounded-2xl border bg-card p-4"><div className="flex items-start gap-3"><div className="rounded-xl bg-emerald-100 p-2.5 text-emerald-700"><Warehouse className="h-5 w-5" /></div><div><div className="text-sm font-semibold">Isi Stok Gudang</div><p className="mt-1 text-xs leading-5 text-muted-foreground">Masukkan semua barang yang tersedia di Gudang saat usaha mulai. Toko dan Sales belum diperlukan.</p></div></div>{warehouseLocations.length === 0 ? <div className="mt-3 rounded-xl bg-orange-50 p-3 text-xs text-orange-900">Gudang Utama belum tersedia. Muat ulang halaman jika baru saja dibuat.</div> : <div className="mt-3 rounded-xl border p-3"><div className="flex items-center justify-between"><div><div className="text-sm font-medium">{warehouseLocations[0].name}</div><div className="text-xs text-muted-foreground">Stok awal usaha</div></div>{setup.status === "active" && <Button size="sm" onClick={() => startEdit(warehouseLocations[0].id)}><Edit3 className="mr-1 h-3.5 w-3.5" /> Isi Stok</Button>}</div><div className="mt-2 text-xs text-muted-foreground">{openings.filter((x) => x.location_id === warehouseLocations[0].id && Number(x.quantity) > 0).length} produk sudah diisi</div></div>}</section>
        <section className="mt-4 rounded-2xl border border-blue-200 bg-blue-50/60 p-4"><b className="text-sm">Setelah dikunci</b><p className="mt-1 text-xs leading-5 text-muted-foreground">Stok berikutnya masuk melalui <b>Restok Produk</b>, lalu bisa digunakan untuk Loading Sales dan penjualan.</p></section>
      </> : <>
        <section className="mt-4 rounded-2xl border border-orange-200 bg-orange-50/60 p-4"><div className="flex items-start gap-3"><RefreshCw className="mt-0.5 h-5 w-5 shrink-0 text-orange-700" /><div><b className="text-sm">Cara migrasi</b><p className="mt-1 text-xs leading-5 text-muted-foreground">Masukkan stok sesuai posisi barang sekarang: <b>Gudang, Toko, dan Sales</b>. Tidak harus selesai sekaligus.</p><p className="mt-2 text-xs leading-5 text-muted-foreground">Punya rekapan stok dari sistem atau catatan manual sebelumnya yang <b>valid</b>? Anda bisa langsung memasukkan saldo akhirnya sebagai <b>Stok Awal</b>, tanpa memasukkan seluruh transaksi lama satu per satu.</p></div></div></section>
        <section className="mt-4 rounded-2xl border bg-card p-4"><div className="flex items-start gap-3"><Store className="mt-0.5 h-5 w-5 text-blue-700" /><div><b className="text-sm">Setelah migrasi</b><p className="mt-1 text-xs leading-5 text-muted-foreground">Saat Sales berjalan, stok Sales tetap dihitung sebagai stok usaha. <b>Sisa barang Sales kembali ke Gudang</b>, dan <b>Retur dari Toko kembali ke Gudang</b>.</p></div></div></section>
        <section className="mt-4 rounded-2xl border bg-card p-4"><div><div className="flex items-center gap-2 text-sm font-semibold"><Package className="h-4 w-4 text-orange-600" /> Yang perlu disiapkan</div><div className="mt-3 space-y-2"><div className="flex items-center justify-between rounded-xl border p-3"><div className="flex items-center gap-3"><div className="rounded-lg bg-orange-100 p-2 text-orange-700"><Package className="h-4 w-4" /></div><div><div className="text-sm font-medium">Produk</div><div className="text-xs text-muted-foreground">{products.length > 0 ? `${products.length} produk siap digunakan.` : "Belum ada produk."}</div></div></div>{hasProducts ? <Check className="h-4 w-4 text-emerald-600" /> : <Link to="/products" className="text-xs font-semibold text-orange-700">Tambah Produk</Link>}</div><div className="flex items-center justify-between rounded-xl border p-3"><div className="flex items-center gap-3"><div className="rounded-lg bg-blue-100 p-2 text-blue-700"><Store className="h-4 w-4" /></div><div><div className="text-sm font-medium">Toko / Outlet</div><div className="text-xs text-muted-foreground">{outlets.length > 0 ? `${outlets.length} toko terdaftar.` : "Belum ada toko."}</div></div></div>{outlets.length > 0 ? <Check className="h-4 w-4 text-emerald-600" /> : <Link to="/outlets" className="text-xs font-semibold text-blue-700">Tambah Toko</Link>}</div><div className="flex items-center justify-between rounded-xl border p-3"><div className="flex items-center gap-3"><div className="rounded-lg bg-purple-100 p-2 text-purple-700"><Users className="h-4 w-4 text-purple-700" /></div><div><div className="text-sm font-medium">Sales <span className="font-normal text-muted-foreground">(opsional)</span></div><div className="text-xs text-muted-foreground">{sales.length > 0 ? `${sales.length} Sales terdaftar.` : "Tidak ada Sales — boleh dilewati."}</div></div></div>{sales.length > 0 ? <Check className="h-4 w-4 text-emerald-600" /> : <Link to="/team" className="text-xs font-semibold text-purple-700">Tambah Sales</Link>}</div></div></section>
        {locations.length === 0 && <section className="mt-4 rounded-2xl border bg-card p-4"><div className="flex items-center gap-2 text-sm font-semibold"><Warehouse className="h-4 w-4" /> Siapkan lokasi stok</div><p className="mt-1 text-xs text-muted-foreground">Lokasi stok dibuat dari Gudang, Toko/Outlet, dan Sales yang tersedia.</p><Button className="mt-3 w-full rounded-xl" onClick={prepareLocations} disabled={preparing || locationsLoading || !hasProducts}>{preparing ? "Menyiapkan…" : hasProducts ? "Siapkan Lokasi Stok" : "Tambahkan Produk Terlebih Dahulu"}</Button></section>}
        {locations.length > 0 && !editing && <section className="mt-4 rounded-2xl border bg-card p-4"><div className="flex items-center justify-between"><div><b className="text-sm">Stok awal per lokasi</b><p className="text-xs text-muted-foreground">Isi sesuai kondisi fisik atau saldo rekapan yang valid.</p></div><span className="text-xs text-muted-foreground">{openings.length} item</span></div><div className="mt-3 space-y-2">{locationSummary.map((l) => <div key={l.id} className="flex items-center justify-between rounded-xl border p-3"><div className="flex min-w-0 items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">{l.location_type === "warehouse" ? <Warehouse className="h-4 w-4" /> : l.location_type === "outlet" ? <Store className="h-4 w-4" /> : <Boxes className="h-4 w-4" />}</div><div className="min-w-0"><div className="truncate text-sm font-medium">{l.name}</div><div className="text-[10px] text-muted-foreground">{l.location_type === "warehouse" ? "Gudang" : l.location_type === "outlet" ? "Toko" : "Sales"} · {l.count} produk terisi</div></div></div>{setup.status === "active" && <Button variant="outline" size="sm" onClick={() => startEdit(l.id)}><Edit3 className="mr-1 h-3.5 w-3.5" /> Isi / Edit</Button>}</div>)}</div><Button variant="outline" className="mt-3 w-full rounded-xl" disabled={setup.status !== "active"} onClick={() => startEdit()}><Edit3 className="mr-2 h-4 w-4" /> Isi / Edit Stok Awal</Button></section>}
      </>}

      {editing && <section className="mt-4 rounded-2xl border bg-card p-4"><div className="flex items-center justify-between gap-3"><div><b className="text-sm">{isFromStart ? "Isi Stok Gudang" : "Isi Stok Awal"}</b><p className="mt-1 text-xs text-muted-foreground">Masukkan jumlah dalam <b>pcs</b>.</p></div><Button variant="ghost" size="sm" onClick={cancelEdit}><X className="mr-1 h-4 w-4" /> Batal</Button></div><select value={selectedLocation} onChange={(e) => startEdit(e.target.value)} disabled={isFromStart} className="mt-3 h-11 w-full rounded-md border bg-background px-3 text-sm">{(isFromStart ? warehouseLocations : locations).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select><div className="mt-3 space-y-2">{products.map((p: any) => <div key={p.id} className="flex items-center gap-2 rounded-xl border p-2.5"><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{p.name}</div><div className="text-[10px] text-muted-foreground">Satuan stok: <b>pcs</b>{Number(p.pcs_per_pack) > 1 ? ` · 1 pack = ${Number(p.pcs_per_pack)} pcs` : ""}</div></div><div className="flex shrink-0 items-center gap-1"><Input aria-label={`Jumlah ${p.name} dalam pcs`} type="number" min={0} step={1} inputMode="numeric" value={qty[p.id] ?? "0"} onChange={(e) => setQty((prev) => ({ ...prev, [p.id]: e.target.value }))} className="h-10 w-20 text-right" /><span className="text-xs font-semibold text-muted-foreground">pcs</span></div></div>)}</div><div className="mt-4 flex gap-2"><Button variant="outline" className="flex-1 rounded-xl" onClick={cancelEdit}><X className="mr-2 h-4 w-4" /> Batal</Button><Button className="flex-1 rounded-xl" disabled={saving} onClick={saveOpening}><Save className="mr-2 h-4 w-4" />{saving ? "Menyimpan…" : "Simpan Stok"}</Button></div><p className="mt-3 text-center text-[10px] text-muted-foreground">Angka masih bisa diperbaiki selama Stok Awal belum dikunci.</p></section>}

      {setup.status === "active" && !editing && <section className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4"><div className="flex items-start gap-3"><div className="rounded-xl bg-emerald-100 p-2 text-emerald-700"><Check className="h-5 w-5" /></div><div className="min-w-0 flex-1"><b className="text-sm">Sudah sesuai?</b><p className="mt-1 text-xs leading-5 text-muted-foreground">Setelah dikunci, Stok Awal tidak lagi diedit. Perubahan berikutnya dicatat melalui transaksi stok.</p></div></div><div className="mt-3 flex items-center justify-between rounded-xl bg-white/70 p-3 text-xs"><span>Total Stok Awal</span><b>{totalOpeningQty.toLocaleString("id-ID")} pcs</b></div><Button className="mt-3 w-full rounded-xl" disabled={finalizing || openings.length === 0} onClick={finalizeOpening}><Check className="mr-2 h-4 w-4" />{finalizing ? "Mengunci…" : "🔒 Kunci Stok Awal"}</Button></section>}
      {setup.status === "finalized" && <section className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4"><div className="flex items-start gap-3"><div className="rounded-xl bg-emerald-100 p-2 text-emerald-700"><Check className="h-5 w-5" /></div><div><b className="text-sm">Stok Awal Sudah Dikunci</b><p className="mt-1 text-xs leading-5 text-muted-foreground">Stok awal sudah menjadi titik awal usaha. Stok berikutnya dicatat melalui <b>Restok Produk</b>, Loading Sales, Penjualan, Retur, dan Setoran.</p></div></div><Link to="/dashboard" className="mt-3 block rounded-xl bg-primary px-4 py-3 text-center text-sm font-semibold text-primary-foreground">Lanjut ke Dashboard</Link></section>}
    </>}

    {pendingMode && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"><div className="w-full max-w-md rounded-2xl bg-background p-5 shadow-xl"><div className="flex items-start gap-3"><div className="rounded-xl bg-orange-100 p-2.5 text-orange-700"><Sparkles className="h-5 w-5" /></div><div><h2 className="text-base font-semibold">Mulai Stok Awal</h2><p className="mt-1 text-sm text-muted-foreground">Anda memilih <b className="text-foreground">{pendingMode === "migration" ? "Usaha Sudah Berjalan" : "Usaha Baru"}</b>.</p></div></div><p className="mt-4 rounded-xl bg-muted/60 p-3 text-xs leading-5 text-muted-foreground">{pendingMode === "migration" ? "Anda bisa memasukkan stok Gudang, Toko, dan Sales. Jika punya rekapan stok lama yang valid, masukkan saldo akhirnya sebagai Stok Awal." : "Cukup isi stok yang tersedia di Gudang. Setelah sesuai, kunci Stok Awal lalu mulai operasional."}</p><div className="mt-4 flex gap-2"><Button variant="outline" className="flex-1 rounded-xl" disabled={savingMode} onClick={() => setPendingMode(null)}>Batal</Button><Button className="flex-1 rounded-xl" disabled={savingMode} onClick={() => chooseMode(pendingMode)}>{savingMode ? "Menyiapkan…" : "Lanjut"}</Button></div></div></div>}
  </main>;
}