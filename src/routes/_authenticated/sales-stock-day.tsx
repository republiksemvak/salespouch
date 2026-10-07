import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Boxes, CheckCircle2, Info, RefreshCw, Truck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { useProducts } from "@/lib/products";
import { packSize, toPieces } from "@/lib/units";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/sales-stock-day")({
  head: () => ({ 
    meta: [
      { title: "Stok Sales — Sales Pouch" }, 
      { name: "description", content: "Transfer stok Gudang ke Sales dan kembalikan sisa kapan saja tanpa batas." }, 
      { property: "og:title", content: "Stok Sales — Sales Pouch" }, 
      { property: "og:description", content: "Transfer stok Gudang ke Sales dan kembalikan sisa kapan saja tanpa batas." }, 
      { property: "og:type", content: "website" }, 
      { name: "twitter:card", content: "summary" }
    ] 
  }),
  component: SalesStockDayPage,
});

type Member = { user_id: string; profiles: { display_name: string | null; username: string | null } | null };
type Day = { id: string; sales_user_id: string; sales_location_id: string; stock_date: string; status: "open" | "closed" };
type Movement = { product_id: string; from_location_id: string | null; to_location_id: string | null; quantity: number };
type Opening = { product_id: string; location_id: string; quantity: number };
type Row = { productId: string; pack: string; pcs: string };

const today = () => new Date().toISOString().slice(0, 10);
const whole = (v: string) => (/^\d+$/.test(v) ? Number(v) : 0);

function SalesStockDayPage() {
  const { data: account, isLoading: accountLoading } = useProfile();
  const { data: products = [] } = useProducts();
  const queryClient = useQueryClient();
  const [salesUserId, setSalesUserId] = useState("");
  const [stockDate, setStockDate] = useState(today);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const ownerId = account?.ownerId;

  const { data: members = [] } = useQuery<Member[]>({ 
    queryKey: ["sales-stock-members", ownerId], 
    enabled: !!ownerId && account?.role !== "sales", 
    queryFn: async () => { 
      const { data, error } = await supabase
        .from("team_members")
        .select("user_id,profiles!team_members_user_id_fkey(display_name,username)")
        .eq("owner_id", ownerId!)
        .order("created_at", { ascending: true }); 
      if (error) throw error; 
      return (data ?? []) as Member[]; 
    } 
  });

  useEffect(() => {
    if (account?.role === "sales" && account.userId && salesUserId !== account.userId) {
      setSalesUserId(account.userId);
      setRows([]);
    }
  }, [account?.role, account?.userId, salesUserId]);

  const selectedMember = members.find((m) => m.user_id === salesUserId);
  const selectedSalesName =
    account?.role === "sales"
      ? account.profile?.display_name || account.profile?.business_name || "Sales"
      : selectedMember?.profiles?.display_name || selectedMember?.profiles?.username || "Sales";
  
  const { data: salesLocation } = useQuery<{ id: string } | null>({ 
    queryKey: ["sales-stock-location", ownerId, salesUserId], 
    enabled: !!ownerId && !!salesUserId, 
    queryFn: async () => { 
      const { data, error } = await supabase
        .from("stock_locations")
        .select("id")
        .eq("owner_id", ownerId!)
        .eq("location_type", "sales")
        .eq("team_member_user_id", salesUserId)
        .eq("is_active", true)
        .maybeSingle(); 
      if (error) throw error; 
      return data; 
    } 
  });

  const { data: day } = useQuery<Day | null>({ 
    queryKey: ["sales-stock-day", ownerId, salesUserId, stockDate], 
    enabled: !!ownerId && !!salesUserId, 
    queryFn: async () => { 
      const { data, error } = await supabase
        .from("sales_stock_days")
        .select("id,sales_user_id,sales_location_id,stock_date,status")
        .eq("owner_id", ownerId!)
        .eq("sales_user_id", salesUserId)
        .eq("stock_date", stockDate)
        .maybeSingle(); 
      if (error) throw error; 
      return data as Day | null; 
    } 
  });

  const { data: openings = [] } = useQuery<Opening[]>({ 
    queryKey: ["sales-stock-openings", ownerId, salesLocation?.id], 
    enabled: !!ownerId && !!salesLocation?.id, 
    queryFn: async () => { 
      const { data, error } = await supabase
        .from("stock_opening_items")
        .select("product_id,location_id,quantity")
        .eq("owner_id", ownerId!)
        .eq("location_id", salesLocation!.id); 
      if (error) throw error; 
      return data ?? []; 
    } 
  });

  const { data: movements = [] } = useQuery<Movement[]>({ 
    queryKey: ["sales-stock-movements", ownerId, salesLocation?.id], 
    enabled: !!ownerId && !!salesLocation?.id, 
    queryFn: async () => { 
      const { data, error } = await supabase
        .from("stock_movements")
        .select("product_id,from_location_id,to_location_id,quantity")
        .eq("owner_id", ownerId!); 
      if (error) throw error; 
      return (data ?? []).filter((m) => m.from_location_id === salesLocation!.id || m.to_location_id === salesLocation!.id); 
    } 
  });

  const currentStock = useMemo(() => { 
    const map = new Map<string, number>(); 
    for (const x of openings) map.set(x.product_id, (map.get(x.product_id) ?? 0) + Number(x.quantity)); 
    for (const x of movements) { 
      if (x.to_location_id === salesLocation?.id) map.set(x.product_id, (map.get(x.product_id) ?? 0) + Number(x.quantity)); 
      if (x.from_location_id === salesLocation?.id) map.set(x.product_id, (map.get(x.product_id) ?? 0) - Number(x.quantity)); 
    } 
    return map; 
  }, [openings, movements, salesLocation?.id]);

  const loadRows = rows.map((r) => { 
    const p = products.find((x) => x.id === r.productId); 
    const qty = p ? toPieces(whole(r.pack), whole(r.pcs), packSize(p.pcs_per_pack)) : 0; 
    return { ...r, qty }; 
  }).filter((r) => r.qty > 0);

  const setRow = (productId: string, field: "pack" | "pcs", value: string) => setRows((current) => { 
    const found = current.find((r) => r.productId === productId); 
    if (found) return current.map((r) => r.productId === productId ? { ...r, [field]: value } : r); 
    return [...current, { productId, pack: field === "pack" ? value : "", pcs: field === "pcs" ? value : "" }]; 
  });

  async function refresh() { 
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["sales-stock-day"] }), 
      queryClient.invalidateQueries({ queryKey: ["sales-stock-movements"] }), 
      queryClient.invalidateQueries({ queryKey: ["sales-stock-openings"] }),
      queryClient.invalidateQueries({ queryKey: ["master-stock-warehouse"] }),
      queryClient.invalidateQueries({ queryKey: ["visit-sales-stock"] })
    ]); 
  }

  // Waktu aktual transaksi agar kronologis jika muat berkali-kali dalam sehari
  const getActionTimestamp = (selectedDate: string) => {
    const isToday = selectedDate === today();
    if (isToday) return new Date().toISOString();
    return new Date(`${selectedDate}T12:00:00`).toISOString();
  };

  async function handleLoadStock() { 
    if (!salesUserId || !loadRows.length) { 
      toast.error("Pilih Sales dan isi jumlah minimal satu produk."); 
      return; 
    } 
    setBusy(true); 
    try { 
      const { error } = await supabase.rpc("record_sales_morning_load", { 
        _sales_user_id: salesUserId, 
        _items: loadRows.map((r) => ({ product_id: r.productId, quantity: r.qty })), 
        _stock_date: stockDate, 
        _occurred_at: getActionTimestamp(stockDate) 
      } as any); 
      if (error) throw error; 
      toast.success("Muatan berhasil dicatat: Gudang → Sales."); 
      setRows([]); 
      await refresh(); 
    } catch (e) { 
      toast.error((e as Error).message); 
    } finally { 
      setBusy(false); 
    } 
  }

  async function handleReturnStock() { 
    if (!salesUserId || !salesLocation?.id) { 
      toast.error("Pilih Sales yang sudah memiliki lokasi stok."); 
      return; 
    } 
    if (totalSalesStock <= 0) {
      toast.error("Stok sales saat ini sudah 0. Tidak ada barang yang perlu dikembalikan.");
      return;
    }
    setBusy(true); 
    try { 
      const { error } = await supabase.rpc("close_sales_stock_day", { 
        _sales_user_id: salesUserId, 
        _stock_date: stockDate, 
        _occurred_at: getActionTimestamp(stockDate) 
      } as any); 
      if (error) throw error; 
      toast.success("Sisa stok Sales berhasil dikembalikan ke Gudang."); 
      await refresh(); 
    } catch (e) { 
      toast.error((e as Error).message); 
    } finally { 
      setBusy(false); 
    } 
  }

  const stockRows = products.map((p) => ({ product: p, qty: currentStock.get(p.id) ?? 0 })).filter((x) => x.qty > 0);
  const totalSalesStock = stockRows.reduce((sum, x) => sum + x.qty, 0);

  if (accountLoading) return <main className="mx-auto max-w-md px-4 pt-12 text-center text-sm text-muted-foreground">Memuat Stok Sales…</main>;
  if (account?.role !== "owner" && account?.role !== "sales") return <main className="mx-auto max-w-md px-4 pt-12 text-center text-destructive">Stok Sales hanya dapat dilihat Owner atau Sales.</main>;

  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-12 pt-5">
      <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Kembali
      </Link>

      <header className="mt-4 flex items-start gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100 text-blue-700 shrink-0">
          <Truck className="h-6 w-6" />
        </div>
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-blue-700">Manajemen Armada</div>
          <h1 className="text-2xl font-bold tracking-tight">Stok Sales / Mobil</h1>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            Muat barang ke armada dan kembalikan sisa ke gudang kapan saja tanpa batas ritase.
          </p>
        </div>
      </header>

      {/* Sales melihat armada miliknya; Owner tetap dapat memilih Sales. */}
      <section className="mt-4 rounded-2xl border bg-card p-4 shadow-sm">
        <div className="grid grid-cols-2 gap-3">
          {account?.role === "owner" ? (
            <label className="text-xs font-medium">
              Pilih Sales
              <select 
                value={salesUserId} 
                onChange={(e) => { setSalesUserId(e.target.value); setRows([]); }} 
                className="mt-1 h-11 w-full rounded-xl border bg-background px-3 text-sm"
              >
                <option value="">Pilih Sales…</option>
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.profiles?.display_name || m.profiles?.username || m.user_id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="rounded-xl border bg-blue-50/60 border-blue-100 px-3 py-2 text-xs">
              <div className="text-muted-foreground">Sales</div>
              <b>{selectedSalesName}</b>
            </div>
          )}
          <label className="text-xs font-medium">
            Tanggal
            <input type="date" value={stockDate} onChange={(e) => setStockDate(e.target.value)} className="mt-1 h-11 w-full rounded-xl border bg-background px-3 text-sm" />
          </label>
        </div>
        <div className="mt-3 flex items-center justify-between rounded-xl bg-blue-50/60 border border-blue-100 px-3 py-2 text-xs">
          <div>Sales: <b>{selectedSalesName}</b></div>
          <div className="text-blue-700 font-semibold">{totalSalesStock.toLocaleString("id-ID")} pcs di tangan</div>
        </div>
      </section>

      {/* Info Fleksibilitas */}
      <div className="mt-3 flex items-start gap-2 rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground border">
        <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
        <div>
          <b>Bebas Muat Berkali-kali:</b> Sales bisa menambah muatan (re-load) kapan saja dalam sehari saat barang habis di jalan, dan menyetor sisa barang tanpa mengunci sistem.
        </div>
      </div>

      {/* 1. Form Muat / Tambah Barang ke Sales */}
      <section className="mt-3 rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <Boxes className="h-5 w-5 text-blue-700" />
          <h2 className="font-bold">Muat / Tambah Barang (Gudang → Sales)</h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Keluarkan stok fisik dari Gudang Utama untuk dibawa sales di motor/mobil.
        </p>

        <div className="mt-4 space-y-2">
          {products.map((p) => { 
            const r = rows.find((x) => x.productId === p.id) ?? { productId: p.id, pack: "", pcs: "" }; 
            return (
              <div key={p.id} className="grid grid-cols-[1fr_75px_75px] items-center gap-2 rounded-xl border p-2.5 bg-background">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{p.name}</div>
                  <div className="text-[11px] text-muted-foreground">1 pack = {packSize(p.pcs_per_pack)} pcs</div>
                </div>
                <Input 
                  value={r.pack} 
                  onChange={(e) => setRow(p.id, "pack", e.target.value)} 
                  inputMode="numeric" 
                  placeholder="Pack" 
                  className="h-10 rounded-lg text-center" 
                />
                <Input 
                  value={r.pcs} 
                  onChange={(e) => setRow(p.id, "pcs", e.target.value)} 
                  inputMode="numeric" 
                  placeholder="Pcs" 
                  className="h-10 rounded-lg text-center" 
                />
              </div>
            ); 
          })}
        </div>

        <Button 
          type="button" 
          disabled={busy || !salesUserId || loadRows.length === 0} 
          onClick={handleLoadStock} 
          className="mt-4 h-11 w-full rounded-xl"
        >
          {busy ? "Memproses…" : "Catat Muatan (Gudang → Sales)"}
        </Button>
      </section>

      {/* 2. Setoran Sisa Barang ke Gudang */}
      <section className="mt-4 rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5 text-emerald-700" />
          <h2 className="font-bold">Kembalikan Sisa Stok (Sales → Gudang)</h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Jika sales selesai keliling atau ingin mengosongkan muatan, kembalikan sisa barang di mobil/motor kembali ke Gudang Utama.
        </p>

        <div className="mt-4 rounded-xl bg-muted/40 p-3.5 border">
          <div className="text-xs text-muted-foreground">Sisa Stok Fisik di Tangan Sales</div>
          <div className="mt-1 text-2xl font-bold text-foreground">
            {totalSalesStock.toLocaleString("id-ID")} pcs
          </div>

          {stockRows.length > 0 ? (
            <div className="mt-3 space-y-1.5 border-t pt-2.5">
              {stockRows.slice(0, 8).map((x) => (
                <div key={x.product.id} className="flex justify-between gap-3 text-xs">
                  <span className="truncate">{x.product.name}</span>
                  <b className="font-mono">{x.qty.toLocaleString("id-ID")} pcs</b>
                </div>
              ))}
              {stockRows.length > 8 && (
                <div className="text-[11px] text-muted-foreground italic">
                  + {stockRows.length - 8} produk lainnya
                </div>
              )}
            </div>
          ) : (
            <div className="mt-2 text-xs text-muted-foreground">
              Tidak ada stok di tangan sales saat ini.
            </div>
          )}
        </div>

        <Button 
          type="button" 
          variant="outline" 
          disabled={busy || !salesUserId || totalSalesStock <= 0} 
          onClick={handleReturnStock} 
          className="mt-4 h-11 w-full rounded-xl border-emerald-600/30 text-emerald-700 hover:bg-emerald-50"
        >
          {busy ? "Memproses…" : "Kembalikan Semua Sisa ke Gudang"}
        </Button>
      </section>

      <p className="mt-4 text-center text-[11px] leading-relaxed text-muted-foreground">
        Setelah barang dikembalikan ke gudang, sales tetap bisa langsung melakukan muat barang lagi di hari yang sama jika ada jadwal pengiriman tambahan.
      </p>
    </main>
  );
}
