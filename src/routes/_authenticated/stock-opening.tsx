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

export const Route = createFileRoute("/_authenticated/stock-opening")({
  head: () => ({ meta: [{ title: "Stok Awal — Sales Pouch" }] }),
  component: OpeningStockPage,
});

type SetupMode = "migration" | "from_start";
type Setup = { id: string; mode: SetupMode; status: "active" | "finalized" };
type Location = { id: string; name: string; location_type: "warehouse" | "outlet" | "sales"; outlet_id?: string | null; team_member_user_id?: string | null };
type Opening = { location_id: string; product_id: string; quantity: number };
type SalesMember = { user_id: string; profiles: { display_name: string | null; username: string | null } | null };

function OpeningStockPage() {
  const { data: account, isLoading: accountLoading } = useProfile();
  const { data: products = [] } = useProducts();
  const queryClient = useQueryClient();
  const ownerId = account?.ownerId;
  const [savingMode, setSavingMode] = useState(false);
  const [pendingMode, setPendingMode] = useState<SetupMode | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState("");
  const [qty, setQty] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  const { data: setup, isLoading: setupLoading } = useQuery<Setup | null>({
    queryKey: ["stock-setup", ownerId],
    enabled: !!ownerId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("stock_setups").select("id,mode,status").eq("owner_id", ownerId).maybeSingle();
      if (error) throw error;
      return data as Setup | null;
    },
  });

  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ["stock-locations", ownerId],
    enabled: !!ownerId && !!setup,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("stock_locations").select("id,name,location_type,outlet_id,team_member_user_id").eq("owner_id", ownerId).eq("is_active", true).order("location_type").order("name");
      if (error) throw error;
      return (data ?? []) as Location[];
    },
  });

  const { data: outlets = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["stock-opening-outlets", ownerId],
    enabled: !!ownerId && !!setup && setup.mode === "migration",
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("outlets").select("id,name").order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const { data: sales = [] } = useQuery<SalesMember[]>({
    queryKey: ["stock-opening-sales", ownerId],
    enabled: !!ownerId && !!setup && setup.mode === "migration",
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("team_members").select("user_id,profiles!team_members_user_id_fkey(display_name,username)").eq("owner_id", ownerId).eq("position", "sales");
      if (error) throw error;
      return (data ?? []) as SalesMember[];
    },
  });

  const { data: openings = [] } = useQuery<Opening[]>({
    queryKey: ["stock-openings", setup?.id],
    enabled: !!setup?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("stock_opening_items").select("location_id,product_id,quantity").eq("setup_id", setup!.id);
      if (error) throw error;
      return (data ?? []) as Opening[];
    },
  });

  const warehouseLocations = useMemo(() => locations.filter((location) => location.location_type === "warehouse"), [locations]);
  const locationSummary = useMemo(() => locations.map((location) => ({ ...location, count: openings.filter((opening) => opening.location_id === location.id && Number(opening.quantity) > 0).length })), [locations, openings]);
  const totalOpeningQty = useMemo(() => openings.reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0), 0), [openings]);
  const hasProducts = products.length > 0;
  const isFromStart = setup?.mode === "from_start";

  async function ensureOpeningWarehouse() {
    if (!ownerId || locations.some((location) => location.location_type === "warehouse")) return;
    const { error } = await (supabase as any).from("stock_locations").insert({ owner_id: ownerId, location_type: "warehouse", name: "Gudang Utama" });
    if (error) throw error;
  }

  async function prepareLocations() {
    if (!ownerId || preparing || !hasProducts) return;
    setPreparing(true);
    try {
      await ensureOpeningWarehouse();
      const existingOutletIds = new Set(locations.filter((location) => location.location_type === "outlet").map((location) => location.outlet_id).filter(Boolean));
      const missingOutlets = outlets.filter((outlet) => !existingOutletIds.has(outlet.id));
      if (missingOutlets.length) {
        const { error } = await (supabase as any).from("stock_locations").insert(missingOutlets.map((outlet) => ({ owner_id: ownerId, location_type: "outlet", name: outlet.name, outlet_id: outlet.id })));
        if (error) throw error;
      }
      const existingSalesIds = new Set(locations.filter((location) => location.location_type === "sales").map((location) => location.team_member_user_id).filter(Boolean));
      const missingSales = sales.filter((member) => !existingSalesIds.has(member.user_id));
      if (missingSales.length) {
        const { error } = await (supabase as any).from("stock_locations").insert(missingSales.map((member) => ({ owner_id: ownerId, location_type: "sales", name: member.profiles?.display_name?.trim() || member.profiles?.username?.trim() || "Sales", team_member_user_id: member.user_id })));
        if (error) throw error;
      }
      await queryClient.invalidateQueries({ queryKey: ["stock-locations", ownerId] });
      toast.success("Lokasi stok sudah siap.");
    } catch (error) {
      toast.error(`Gagal menyiapkan lokasi: ${(error as Error).message}`);
    } finally {
      setPreparing(false);
    }
  }

  function startEdit(locationId?: string) {
    const defaultLocationId = isFromStart ? warehouseLocations[0]?.id : locations[0]?.id;
    const nextLocationId = locationId ?? defaultLocationId ?? "";
    const nextQty: Record<string, string> = {};
    openings.filter((opening) => opening.location_id === nextLocationId).forEach((opening) => { nextQty[opening.product_id] = String(Number(opening.quantity) || 0); });
    setSelectedLocation(nextLocationId);
    setQty(nextQty);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setSelectedLocation("");
    setQty({});
  }

  async function saveOpening() {
    if (!setup || !ownerId || !selectedLocation) return;
    setSaving(true);
    try {
      const { error: deleteError } = await (supabase as any).from("stock_opening_items").delete().eq("setup_id", setup.id).eq("location_id", selectedLocation);
      if (deleteError) throw deleteError;
      const rows = products.map((product: any) => ({ setup_id: setup.id, owner_id: ownerId, location_id: selectedLocation, product_id: product.id, quantity: Math.max(0, Number(qty[product.id] || 0)) })).filter((row: { quantity: number }) => row.quantity > 0);
      if (rows.length) {
        const { error } = await (supabase as any).from("stock_opening_items").insert(rows);
        if (error) throw error;
      }
      await queryClient.invalidateQueries({ queryKey: ["stock-openings", setup.id] });
      toast.success("Stok awal berhasil disimpan.");
      cancelEdit();
    } catch (error) {
      toast.error(`Gagal menyimpan: ${(error as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  async function finalizeOpening() {
    if (!setup || !ownerId || setup.status !== "active" || editing || finalizing) return;
    if (!window.confirm(`Kunci Stok Awal?\n\nTotal stok yang tercatat: ${totalOpeningQty.toLocaleString("id-ID")} pcs.\n\nPastikan stok sudah diperiksa. Setelah dikunci, stok awal tidak lagi diedit dan perubahan berikutnya dicatat melalui transaksi stok.`)) return;
    setFinalizing(true);
    try {
      const { data, error } = await (supabase as any).from("stock_setups").update({ status: "finalized" }).eq("id", setup.id).eq("owner_id", ownerId).select("id,mode,status").single();
      if (error) throw error;
      queryClient.setQueryData(["stock-setup", ownerId], data as Setup);
      toast.success("Stok awal berhasil dikunci.");
    } catch (error) {
      toast.error(`Gagal mengunci stok awal: ${(error as Error).message}`);
    } finally {
      setFinalizing(false);
    }
  }

  async function chooseMode(mode: SetupMode) {
    if (!ownerId || savingMode) return;
    setSavingMode(true);
    try {
      const { data, error } = await (supabase as any).from("stock_setups").insert({ owner_id: ownerId, mode, status: "active" }).select("id,mode,status").single();
      if (error) throw error;
      queryClient.setQueryData(["stock-setup", ownerId], data as Setup);
      setPendingMode(null);
      if (mode === "from_start") {
        await ensureOpeningWarehouse();
        await queryClient.invalidateQueries({ queryKey: ["stock-locations", ownerId] });
        toast.success("Stok Gudang Awal siap diisi.");
      } else {
        toast.success("Migrasi stok awal siap diisi.");
      }
    } catch (error) {
      toast.error(`Gagal menyimpan: ${(error as Error).message}`);
    } finally {
      setSavingMode(false);
    }
  }

  if (accountLoading || setupLoading) return <main className="mx-auto max-w-md px-4 pt-12 text-center text-sm text-muted-foreground">Memuat stok awal…</main>;
  if (account?.role !== "owner") return <main className="mx-auto max-w-md px-4 pt-12 text-center text-destructive">Hanya Owner yang dapat mengatur stok awal.</main>;

  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-10 pt-5">
      <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" /> Kembali ke Dashboard</Link>
      <header className="mt-5 flex items-start gap-3"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-orange-100 text-orange-700"><Boxes className="h-6 w-6" /></div><div><h1 className="text-2xl font-bold tracking-tight">Stok Awal</h1><p className="mt-1 text-sm text-muted-foreground">Masukkan stok yang menjadi titik awal penggunaan Sales Pouch.</p></div></header>

      {!setup ? (
        <div className="mt-6 space-y-3">
          <section className="rounded-2xl border bg-card p-4"><div className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-orange-600" /> Bagaimana kondisi usaha Anda?</div><p className="mt-2 text-xs leading-5 text-muted-foreground">Usaha baru cukup isi stok Gudang. Jika usaha sudah berjalan, isi stok sesuai posisi barang sekarang atau gunakan rekapan stok lama yang valid.</p></section>
          <button type="button" disabled={savingMode} onClick={() => setPendingMode("from_start")} className="w-full rounded-2xl border bg-card p-4 text-left shadow-sm"><div className="flex gap-3"><div className="rounded-xl bg-emerald-100 p-3 text-emerald-700"><Warehouse className="h-5 w-5" /></div><div className="flex-1"><b>Usaha Baru</b><p className="mt-1 text-xs leading-5 text-muted-foreground">Isi stok Gudang → kunci → mulai operasional.</p></div></div></button>
          <button type="button" disabled={savingMode} onClick={() => setPendingMode("migration")} className="w-full rounded-2xl border bg-card p-4 text-left shadow-sm"><div className="flex gap-3"><div className="rounded-xl bg-orange-100 p-3 text-orange-700"><RefreshCw className="h-5 w-5" /></div><div className="flex-1"><b>Usaha Sudah Berjalan</b><p className="mt-1 text-xs leading-5 text-muted-foreground">Isi Gudang, Toko, dan Sales sesuai kondisi sekarang, atau gunakan saldo rekapan yang valid.</p></div></div></button>
        </div>
      ) : (
        <>
          <section className="mt-6 rounded-2xl border bg-card p-4"><div className="flex items-center gap-3"><Check className="h-5 w-5 text-emerald-600" /><div><div className="text-xs text-muted-foreground">Kondisi usaha</div><b>{isFromStart ? "Usaha Baru" : "Usaha Sudah Berjalan — Migrasi"}</b></div></div><div className="mt-3 rounded-xl bg-muted/60 p-3 text-xs">Status stok awal: <b>{setup.status === "active" ? "masih bisa diisi dan diperiksa" : "sudah dikunci"}</b></div></section>

          {isFromStart ? (
            <>
              <section className="mt-4 rounded-2xl border bg-card p-4"><div className="flex items-start gap-3"><div className="rounded-xl bg-emerald-100 p-2.5 text-emerald-700"><Warehouse className="h-5 w-5" /></div><div><div className="text-sm font-semibold">Isi Stok Gudang</div><p className="mt-1 text-xs leading-5 text-muted-foreground">Masukkan semua barang yang tersedia di Gudang saat usaha mulai. Toko dan Sales belum diperlukan.</p></div></div>{warehouseLocations.length === 0 ? <div className="mt-3 rounded-xl bg-orange-50 p-3 text-xs text-orange-900">Gudang Utama belum tersedia. Muat ulang halaman jika baru saja dibuat.</div> : <div className="mt-3 rounded-xl border p-3"><div className="flex items-center justify-between"><div><div className="text-sm font-medium">{warehouseLocations[0].name}</div><div className="text-xs text-muted-foreground">Stok awal usaha</div></div>{setup.status === "active" && <Button size="sm" onClick={() => startEdit(warehouseLocations[0].id)}><Edit3 className="mr-1 h-3.5 w-3.5" /> Isi Stok</Button>}</div><div className="mt-2 text-xs text-muted-foreground">{openings.filter((item) => item.location_id === warehouseLocations[0].id && Number(item.quantity) > 0).length} produk sudah diisi</div></div>}</section>
              <section className="mt-4 rounded-2xl border border-blue-200 bg-blue-50/60 p-4"><b className="text-sm">Setelah dikunci</b><p className="mt-1 text-xs leading-5 text-muted-foreground">Stok berikutnya masuk melalui <b>Restok Produk</b>, lalu bisa digunakan untuk Loading Sales dan penjualan.</p></section>
            </>
          ) : (
            <>
              <section className="mt-4 rounded-2xl border border-orange-200 bg-orange-50/60 p-4"><div className="flex items-start gap-3"><RefreshCw className="mt-0.5 h-5 w-5 shrink-0 text-orange-700" /><div><b className="text-sm">Cara migrasi</b><p className="mt-1 text-xs leading-5 text-muted-foreground">Masukkan stok sesuai posisi barang sekarang: <b>Gudang, Toko, dan Sales</b>. Tidak harus selesai sekaligus.</p><p className="mt-2 text-xs leading-5 text-muted-foreground">Punya rekapan dari sistem atau catatan manual yang <b>valid</b>? Langsung masukkan saldo akhirnya sebagai <b>Stok Awal</b>. Tidak perlu memasukkan seluruh transaksi lama satu per satu.</p><div className="mt-3 rounded-xl bg-white/70 p-3 text-xs leading-5"><b>Contoh:</b> catatan manual terakhir yang valid menunjukkan Toko A 20 pcs, Toko B 15 pcs, dan Sales 10 pcs. Angka tersebut dapat langsung dimasukkan sebagai Stok Awal.</div></div></div></section>
              <section className="mt-4 rounded-2xl border bg-card p-4"><div className="flex items-start gap-3"><Store className="mt-0.5 h-5 w-5 text-blue-700" /><div><b className="text-sm">Setelah migrasi</b><p className="mt-1 text-xs leading-5 text-muted-foreground">Saat Sales berjalan, stok Sales tetap dihitung sebagai stok usaha. <b>Sisa barang Sales kembali ke Gudang</b>, dan <b>Retur dari Toko kembali ke Gudang</b>.</p><div className="mt-3 rounded-xl bg-muted/60 p-3 text-xs leading-5"><b>Alur:</b> Gudang → Loading Sales → Sales → Toko/Penjualan. Sisa Sales → Gudang. Retur Toko → Gudang.</div></div></div></section>
              <section className="mt-4 rounded-2xl border bg-card p-4"><div className="flex items-center gap-2 text-sm font-semibold"><Package className="h-4 w-4 text-orange-600" /> Yang perlu disiapkan</div><div className="mt-3 space-y-2"><div className="flex items-center gap-3 rounded-xl border p-3"><Package className="h-4 w-4 text-orange-700" /><div><div className="text-sm font-medium">Produk</div><div className="text-xs text-muted-foreground">{hasProducts ? `${products.length} produk siap digunakan.` : "Belum ada produk."}</div></div></div><div className="flex items-center gap-3 rounded-xl border p-3"><Store className="h-4 w-4 text-blue-700" /><div><div className="text-sm font-medium">Toko / Outlet</div><div className="text-xs text-muted-foreground">{outlets.length ? `${outlets.length} toko terdaftar.` : "Belum ada toko."}</div></div></div><div className="flex items-center gap-3 rounded-xl border p-3"><Users className="h-4 w-4 text-purple-700" /><div><div className="text-sm font-medium">Sales <span className="font-normal text-muted-foreground">(opsional)</span></div><div className="text-xs text-muted-foreground">{sales.length ? `${sales.length} Sales terdaftar.` : "Tidak ada Sales — boleh dilewati."}</div></div></div></div></section>
              {locations.length === 0 && <section className="mt-4 rounded-2xl border bg-card p-4"><div className="flex items-center gap-2 text-sm font-semibold"><Warehouse className="h-4 w-4" /> Siapkan lokasi stok</div><p className="mt-1 text-xs text-muted-foreground">Lokasi stok dibuat dari Gudang, Toko/Outlet, dan Sales yang tersedia.</p><Button className="mt-3 w-full rounded-xl" onClick={prepareLocations} disabled={preparing || !hasProducts}>{preparing ? "Menyiapkan…" : hasProducts ? "Siapkan Lokasi Stok" : "Tambahkan Produk Terlebih Dahulu"}</Button></section>}
              {locations.length > 0 && !editing && <section className="mt-4 rounded-2xl border bg-card p-4"><div className="flex items-center justify-between"><div><b className="text-sm">Stok awal per lokasi</b><p className="text-xs text-muted-foreground">Isi sesuai kondisi fisik atau saldo rekapan yang valid.</p></div><span className="text-xs text-muted-foreground">{openings.length} item</span></div><div className="mt-3 space-y-2">{locationSummary.map((location) => <div key={location.id} className="flex items-center justify-between rounded-xl border p-3"><div className="flex min-w-0 items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">{location.location_type === "warehouse" ? <Warehouse className="h-4 w-4" /> : location.location_type === "outlet" ? <Store className="h-4 w-4" /> : <Boxes className="h-4 w-4" />}</div><div className="min-w-0"><div className="truncate text-sm font-medium">{location.name}</div><div className="text-[10px] text-muted-foreground">{location.location_type === "warehouse" ? "Gudang" : location.location_type === "outlet" ? "Toko" : "Sales"} · {location.count} produk terisi</div></div></div>{setup.status === "active" && <Button variant="outline" size="sm" onClick={() => startEdit(location.id)}><Edit3 className="mr-1 h-3.5 w-3.5" /> Isi / Edit</Button>}</div>)}</div></section>}
            </>
          )}

          {editing && <section className="mt-4 rounded-2xl border bg-card p-4"><div className="flex items-center justify-between gap-3"><div><b className="text-sm">{isFromStart ? "Isi Stok Gudang" : "Isi Stok Awal"}</b><p className="mt-1 text-xs text-muted-foreground">Masukkan jumlah dalam <b>pcs</b>.</p></div><Button variant="ghost" size="sm" onClick={cancelEdit}><X className="mr-1 h-4 w-4" /> Batal</Button></div><select value={selectedLocation} onChange={(event) => startEdit(event.target.value)} disabled={isFromStart} className="mt-3 h-11 w-full rounded-md border bg-background px-3 text-sm">{(isFromStart ? warehouseLocations : locations).map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select><div className="mt-3 space-y-2">{products.map((product: any) => <div key={product.id} className="flex items-center gap-2 rounded-xl border p-2.5"><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{product.name}</div><div className="text-[10px] text-muted-foreground">Satuan stok: <b>pcs</b>{Number(product.pcs_per_pack) > 1 ? ` · 1 pack = ${Number(product.pcs_per_pack)} pcs` : ""}</div></div><div className="flex shrink-0 items-center gap-1"><Input aria-label={`Jumlah ${product.name} dalam pcs`} type="number" min={0} step={1} inputMode="numeric" value={qty[product.id] ?? "0"} onChange={(event) => setQty((previous) => ({ ...previous, [product.id]: event.target.value }))} className="h-10 w-20 text-right" /><span className="text-xs font-semibold text-muted-foreground">pcs</span></div></div>)}</div><div className="mt-4 flex gap-2"><Button variant="outline" className="flex-1 rounded-xl" onClick={cancelEdit}><X className="mr-2 h-4 w-4" /> Batal</Button><Button className="flex-1 rounded-xl" disabled={saving} onClick={saveOpening}><Save className="mr-2 h-4 w-4" />{saving ? "Menyimpan…" : "Simpan Stok"}</Button></div><p className="mt-3 text-center text-[10px] text-muted-foreground">Angka masih bisa diperbaiki selama Stok Awal belum dikunci.</p></section>}

          {setup.status === "active" && !editing && <section className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4"><div className="flex items-start gap-3"><div className="rounded-xl bg-emerald-100 p-2 text-emerald-700"><Check className="h-5 w-5" /></div><div className="min-w-0 flex-1"><b className="text-sm">Sudah sesuai?</b><p className="mt-1 text-xs leading-5 text-muted-foreground">Setelah dikunci, Stok Awal tidak lagi diedit. Perubahan berikutnya dicatat melalui transaksi stok.</p></div></div><div className="mt-3 flex items-center justify-between rounded-xl bg-white/70 p-3 text-xs"><span>Total Stok Awal</span><b>{totalOpeningQty.toLocaleString("id-ID")} pcs</b></div><Button className="mt-3 w-full rounded-xl" disabled={finalizing || openings.length === 0} onClick={finalizeOpening}><Check className="mr-2 h-4 w-4" />{finalizing ? "Mengunci…" : "🔒 Kunci Stok Awal"}</Button></section>}
          {setup.status === "finalized" && <section className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4"><div className="flex items-start gap-3"><div className="rounded-xl bg-emerald-100 p-2 text-emerald-700"><Check className="h-5 w-5" /></div><div><b className="text-sm">Stok Awal Sudah Dikunci</b><p className="mt-1 text-xs leading-5 text-muted-foreground">Stok awal sudah menjadi titik awal usaha. Stok berikutnya dicatat melalui <b>Restok Produk</b>, Loading Sales, Penjualan, Retur, dan Setoran.</p></div></div><Link to="/dashboard" className="mt-3 block rounded-xl bg-primary px-4 py-3 text-center text-sm font-semibold text-primary-foreground">Lanjut ke Dashboard</Link></section>}
        </>
      )}

      {pendingMode && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"><div className="w-full max-w-md rounded-2xl bg-background p-5 shadow-xl"><div className="flex items-start gap-3"><div className="rounded-xl bg-orange-100 p-2.5 text-orange-700"><Sparkles className="h-5 w-5" /></div><div><h2 className="text-base font-semibold">Mulai Stok Awal</h2><p className="mt-1 text-sm text-muted-foreground">Anda memilih <b className="text-foreground">{pendingMode === "migration" ? "Usaha Sudah Berjalan" : "Usaha Baru"}</b>.</p></div></div><p className="mt-4 rounded-xl bg-muted/60 p-3 text-xs leading-5 text-muted-foreground">{pendingMode === "migration" ? "Masukkan stok Gudang, Toko, dan Sales sesuai kondisi sekarang. Jika punya rekapan manual atau sistem yang valid, masukkan saldo akhirnya sebagai Stok Awal tanpa memindahkan seluruh transaksi lama." : "Cukup isi stok yang tersedia di Gudang. Setelah sesuai, kunci Stok Awal lalu mulai operasional."}</p><div className="mt-4 flex gap-2"><Button variant="outline" className="flex-1 rounded-xl" disabled={savingMode} onClick={() => setPendingMode(null)}>Batal</Button><Button className="flex-1 rounded-xl" disabled={savingMode} onClick={() => chooseMode(pendingMode)}>{savingMode ? "Menyiapkan…" : "Lanjut"}</Button></div></div></div>}
    </main>
  );
}
