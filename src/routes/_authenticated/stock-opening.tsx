import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, Boxes, Check, ChevronRight, Edit3, Package, RefreshCw, Save, Sparkles, Store, Warehouse, X } from "lucide-react";
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
  const [pendingMode, setPendingMode] = useState<SetupMode | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState("");
  const [qty, setQty] = useState<Record<string, string>>({});

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
  const { data: openings = [] } = useQuery<Opening[]>({
    queryKey: ["stock-openings", setup?.id], enabled: !!setup?.id,
    queryFn: async () => { const { data, error } = await (supabase as any).from("stock_opening_items").select("location_id,product_id,quantity").eq("setup_id", setup!.id); if (error) throw error; return data ?? []; },
  });

  const warehouse = locations.find((l) => l.location_type === "warehouse");
  const warehouseDone = !!warehouse && openings.some((x) => x.location_id === warehouse.id && Number(x.quantity) > 0);
  const total = useMemo(() => openings.reduce((s, x) => s + Math.max(0, Number(x.quantity) || 0), 0), [openings]);
  const outletLocations = locations.filter((l) => l.location_type === "outlet");
  const canEdit = !!setup && setup.status === "active" && !editing;

  async function prepareLocations() {
    if (!account?.ownerId || busy || !products.length) return;
    setBusy(true);
    try {
      if (!locations.some((x) => x.location_type === "warehouse")) {
        const { error } = await (supabase as any).from("stock_locations").insert({ owner_id: account.ownerId, location_type: "warehouse", name: "Gudang Utama" });
        if (error) throw error;
      }
      const existingOutletIds = new Set((locations as any).filter((x: any) => x.location_type === "outlet").map((x: any) => x.outlet_id));
      const missing = outlets.filter((o) => !existingOutletIds.has(o.id));
      if (missing.length) {
        const { error } = await (supabase as any).from("stock_locations").insert(missing.map((o) => ({ owner_id: account.ownerId, location_type: "outlet", name: o.name, outlet_id: o.id })));
        if (error) throw error;
      }
      await qc.invalidateQueries({ queryKey: ["stock-locations", account.ownerId] });
      toast.success("Lokasi stok siap.");
    } catch (e) { toast.error(`Gagal menyiapkan lokasi: ${(e as Error).message}`); } finally { setBusy(false); }
  }

  function startEdit(locationId: string) {
    const next: Record<string, string> = {};
    openings.filter((x) => x.location_id === locationId).forEach((x) => { next[x.product_id] = String(Number(x.quantity) || 0); });
    setSelectedLocation(locationId); setQty(next); setEditing(true);
  }
  function closeEdit() { setEditing(false); setSelectedLocation(""); setQty({}); }

  async function saveOpening() {
    if (!setup || !selectedLocation) return;
    setBusy(true);
    try {
      const { error: delError } = await (supabase as any).from("stock_opening_items").delete().eq("setup_id", setup.id).eq("location_id", selectedLocation);
      if (delError) throw delError;
      const rows = products.map((p: any) => ({ setup_id: setup.id, owner_id: account!.ownerId, location_id: selectedLocation, product_id: p.id, quantity: Math.max(0, Number(qty[p.id] || 0)) })).filter((r: any) => r.quantity > 0);
      if (rows.length) { const { error } = await (supabase as any).from("stock_opening_items").insert(rows); if (error) throw error; }
      await qc.invalidateQueries({ queryKey: ["stock-openings", setup.id] });
      toast.success(selectedLocation === warehouse?.id ? "Stok Gudang berhasil disimpan." : "Stok outlet berhasil dicatat sebagai stok yang sudah tersebar.");
      closeEdit();
    } catch (e) { toast.error(`Gagal menyimpan: ${(e as Error).message}`); } finally { setBusy(false); }
  }

  async function chooseMode(mode: SetupMode) {
    if (!account?.ownerId || busy) return;
    setBusy(true);
    try {
      const { data, error } = await (supabase as any).from("stock_setups").insert({ owner_id: account.ownerId, mode, status: "active" }).select("id,mode,status").single();
      if (error) throw error;
      qc.setQueryData(["stock-setup", account.ownerId], data); setPendingMode(null); toast.success("Mode stok disimpan.");
    } catch (e) { toast.error(`Gagal menyimpan: ${(e as Error).message}`); } finally { setBusy(false); }
  }

  async function cancelMode() {
    if (!setup || openings.length || busy) return;
    setBusy(true);
    try { const { error } = await (supabase as any).from("stock_setups").delete().eq("id", setup.id).eq("owner_id", account!.ownerId); if (error) throw error; qc.setQueryData(["stock-setup", account!.ownerId], null); toast.success("Mode dibatalkan."); }
    catch (e) { toast.error(`Gagal membatalkan: ${(e as Error).message}`); } finally { setBusy(false); }
  }

  async function finalize() {
    if (!setup || setup.status !== "active" || editing || busy) return;
    if (setup.mode === "migration" && !warehouseDone) { toast.error("Stok Gudang wajib diselesaikan terlebih dahulu."); return; }
    if (!confirm(`Finalisasi Stok Pembukaan?\n\nTotal tercatat: ${total.toLocaleString("id-ID")} pcs.\n\nSetelah final, stok pembukaan terkunci.`)) return;
    setBusy(true);
    try { const { data, error } = await (supabase as any).from("stock_setups").update({ status: "finalized" }).eq("id", setup.id).eq("owner_id", account!.ownerId).select("id,mode,status").single(); if (error) throw error; qc.setQueryData(["stock-setup", account!.ownerId], data); toast.success("Stok pembukaan berhasil difinalisasi."); }
    catch (e) { toast.error(`Gagal finalisasi: ${(e as Error).message}`); } finally { setBusy(false); }
  }

  if (accountLoading || setupLoading) return <main className="mx-auto max-w-md px-4 pt-12 text-center text-sm text-muted-foreground">Memuat…</main>;
  if (account?.role !== "owner") return <main className="mx-auto max-w-md px-4 pt-12 text-center text-destructive">Hanya Owner yang dapat mengatur stok pembukaan.</main>;

  return <main className="mx-auto min-h-screen max-w-md px-4 pb-12 pt-5">
    <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" /> Kembali</Link>
    <header className="mt-5 flex items-start gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-100 text-orange-700"><Boxes className="h-6 w-6" /></div><div><h1 className="text-2xl font-bold">Stok Pembukaan</h1><p className="mt-1 text-sm text-muted-foreground">{setup?.mode === "migration" ? "Migrasi dimulai dari Gudang. Setelah Gudang selesai, baru catat stok outlet yang sudah tersebar." : "Masukkan seluruh stok awal sebelum usaha mulai berjalan."}</p></div></header>

    {!setup ? <div className="mt-6 space-y-3"><section className="rounded-2xl border bg-card p-4"><div className="flex items-center gap-2 font-semibold text-sm"><Sparkles className="h-4 w-4 text-orange-600" /> Bagaimana kondisi usaha?</div><p className="mt-2 text-xs text-muted-foreground">Pilih sekali. Data baru tersimpan setelah konfirmasi.</p></section><button type="button" disabled={busy} onClick={() => setPendingMode("migration")} className="w-full rounded-2xl border bg-card p-4 text-left"><div className="flex gap-3"><div className="rounded-xl bg-orange-100 p-3 text-orange-700"><RefreshCw className="h-5 w-5" /></div><div className="flex-1"><b>Usaha sudah berjalan</b><p className="mt-1 text-xs text-muted-foreground">Migrasi: mulai dari stok Gudang, lalu catat stok outlet yang sudah ada.</p></div><ChevronRight /></div></button><button type="button" disabled={busy} onClick={() => setPendingMode("from_start")} className="w-full rounded-2xl border bg-card p-4 text-left"><div className="flex gap-3"><div className="rounded-xl bg-emerald-100 p-3 text-emerald-700"><Warehouse className="h-5 w-5" /></div><div className="flex-1"><b>Usaha baru / mulai dari awal</b><p className="mt-1 text-xs text-muted-foreground">Catat seluruh stok awal sebelum operasional dimulai.</p></div><ChevronRight /></div></button></div> : <>
      <section className="mt-6 rounded-2xl border bg-card p-4"><div className="flex items-center gap-3"><Check className="h-5 w-5 text-emerald-600" /><div className="flex-1"><div className="text-xs text-muted-foreground">Mode</div><b>{setup.mode === "migration" ? "Migrasi Usaha" : "Mulai dari Awal"}</b></div>{setup.status === "active" && openings.length === 0 && <Button variant="outline" size="sm" disabled={busy} onClick={cancelMode}><X className="mr-1 h-3.5 w-3.5" /> Batal</Button>}</div><div className="mt-3 rounded-xl bg-muted/60 p-3 text-xs">Status: <b>{setup.status === "active" ? "Aktif" : "Final — terkunci"}</b></div></section>

      {setup.mode === "migration" && <section className="mt-4 rounded-2xl border bg-card p-4"><div className="flex items-center gap-3"><Warehouse className="h-5 w-5 text-orange-600" /><div><b className="text-sm">Langkah 1 — Selesaikan Gudang</b><p className="text-xs text-muted-foreground">Ini wajib sebelum outlet dapat dicatat.</p></div></div><div className={`mt-3 rounded-xl p-3 text-xs ${warehouseDone ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>{warehouseDone ? "✓ Stok Gudang sudah diisi." : "Belum selesai. Masukkan stok fisik Gudang terlebih dahulu."}</div></section>}

      <section className="mt-4 rounded-2xl border bg-card p-4"><div className="flex items-center gap-2 text-sm font-semibold"><Package className="h-4 w-4 text-orange-600" /> {setup.mode === "migration" ? "Langkah 2 — Stok yang Sudah Tersebar" : "Lokasi Stok Awal"}</div><p className="mt-1 text-xs leading-5 text-muted-foreground">{setup.mode === "migration" ? "Catat stok yang memang sudah berada di outlet. Ini snapshot, bukan pengiriman dari Gudang." : "Masukkan stok awal sesuai lokasi fisiknya."}</p><div className="mt-3 space-y-2">{locations.filter(l => l.location_type !== "sales").map(l => { const count = openings.filter(x => x.location_id === l.id && Number(x.quantity) > 0).length; const locked = setup.status !== "active" || editing || (setup.mode === "migration" && l.location_type === "outlet" && !warehouseDone); return <button key={l.id} type="button" disabled={locked} onClick={() => startEdit(l.id)} className="flex w-full items-center justify-between rounded-xl border p-3 text-left disabled:opacity-50"><span className="flex items-center gap-3"><span className="rounded-lg bg-muted p-2">{l.location_type === "warehouse" ? <Warehouse className="h-4 w-4" /> : <Store className="h-4 w-4" />}</span><span><b className="text-sm">{l.name}</b><span className="block text-xs text-muted-foreground">{l.location_type === "warehouse" ? "Stok pusat" : "Snapshot stok outlet"} · {count} produk</span></span></span><Edit3 className="h-4 w-4 text-muted-foreground" /></button>; })}</div></section>

      {setup.mode === "migration" && warehouseDone && <section className="mt-4 rounded-2xl border bg-blue-50 p-4"><div className="flex items-center gap-2 text-sm font-semibold text-blue-900"><RefreshCw className="h-4 w-4" /> Setelah Migration</div><p className="mt-1 text-xs leading-5 text-blue-800">Outlet baru dan pengiriman berikutnya menggunakan perpindahan stok operasional. Jalur Sales: Gudang → Sales → Outlet saat nota keluar; sisa/retur yang dibawa pulang kembali ke Gudang.</p><Link to="/sales-stock-day" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-blue-900">Buka Muatan & Tutup Sales <ChevronRight className="h-3.5 w-3.5" /></Link></section>}

      <div className="mt-4 rounded-xl border bg-muted/30 p-3 text-xs text-muted-foreground">Total stok pembukaan: <b>{total.toLocaleString("id-ID")} pcs</b></div>
      <Button className="mt-4 w-full rounded-xl" disabled={setup.status !== "active" || editing || busy || locationsLoading || (setup.mode === "migration" && !warehouseDone)} onClick={finalize}>{busy ? "Memproses…" : "Finalisasi Stok Pembukaan"}</Button>

      {editing && <div className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md border-t bg-background p-4 shadow-2xl"><div className="mb-3 flex items-center justify-between"><div><b>{locations.find(l => l.id === selectedLocation)?.name}</b><div className="text-xs text-muted-foreground">Masukkan jumlah fisik. Untuk Migration outlet, angka ini tidak mengurangi Gudang.</div></div><Button variant="ghost" size="sm" onClick={closeEdit}>Tutup</Button></div><div className="max-h-[55vh] space-y-2 overflow-y-auto">{products.map((p: any) => <div key={p.id} className="flex items-center gap-3 rounded-xl border p-3"><div className="min-w-0 flex-1"><b className="text-sm">{p.name}</b></div><Input inputMode="numeric" type="number" min="0" value={qty[p.id] ?? ""} onChange={e => setQty(v => ({ ...v, [p.id]: e.target.value }))} className="w-28 text-right" placeholder="0" /></div>)}</div><Button className="mt-3 w-full rounded-xl" disabled={busy} onClick={saveOpening}><Save className="mr-2 h-4 w-4" />Simpan Stok</Button></div>}
      {pendingMode && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4"><div className="w-full max-w-md rounded-2xl bg-background p-5"><b>{pendingMode === "migration" ? "Migrasi Usaha" : "Mulai dari Awal"}</b><p className="mt-2 text-sm text-muted-foreground">{pendingMode === "migration" ? "Pertama selesaikan Gudang. Setelah itu Anda dapat mencatat stok yang memang sudah tersebar di outlet tanpa mengurangi stok Gudang." : "Anda akan mencatat seluruh stok awal sebelum operasional."}</p><div className="mt-4 flex gap-2"><Button variant="outline" className="flex-1" onClick={() => setPendingMode(null)}>Batal</Button><Button className="flex-1" disabled={busy} onClick={() => chooseMode(pendingMode)}>Konfirmasi</Button></div></div></div>}
    </>}</main>;
}
