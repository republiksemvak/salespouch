import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Plus, RefreshCw, Truck, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { useProducts } from "@/lib/products";
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
const today = () => new Date().toISOString().slice(0, 10);

// Sales stock visibility: Sales accounts read their own current balance through a server-side RPC.\nfunction SalesStockDayPage() {
  const { data: account, isLoading: accountLoading } = useProfile();
  const { data: products = [] } = useProducts();
  const queryClient = useQueryClient();
  const [salesUserId, setSalesUserId] = useState("");
  const [stockDate, setStockDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const ownerId = account?.ownerId;
  const isOwner = account?.role === "owner";
  const [loadProductId, setLoadProductId] = useState("");
  const [loadPacks, setLoadPacks] = useState("");
  const [loadPcs, setLoadPcs] = useState("");
  const [loadFormOpen, setLoadFormOpen] = useState(false);

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

  const { data: salesCurrentStock = [] } = useQuery<{ product_id: string; quantity: number }[]>({
    queryKey: ["sales-current-stock", ownerId, salesUserId],
    enabled: account?.role === "sales" && !!salesUserId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_sales_current_stock", {
        _sales_user_id: salesUserId,
      });
      if (error) throw error;
      return (data ?? []) as { product_id: string; quantity: number }[];
    },
    staleTime: 5_000,
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

  const currentStock = useMemo(() => {\n    const map = new Map<string, number>();\n    if (account?.role === "sales") {\n      for (const x of salesCurrentStock) map.set(x.product_id, Number(x.quantity));\n      return map;\n    }\n    for (const x of openings) map.set(x.product_id, (map.get(x.product_id) ?? 0) + Number(x.quantity));\n    for (const x of movements) {\n      if (x.to_location_id === salesLocation?.id) map.set(x.product_id, (map.get(x.product_id) ?? 0) + Number(x.quantity));\n      if (x.from_location_id === salesLocation?.id) map.set(x.product_id, (map.get(x.product_id) ?? 0) - Number(x.quantity));\n    }\n    return map;\n  }, [account?.role, salesCurrentStock, openings, movements, salesLocation?.id]);

  async function refresh() { 
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["sales-stock-day"] }), 
      queryClient.invalidateQueries({ queryKey: ["sales-stock-movements"] }), 
      queryClient.invalidateQueries({ queryKey: ["sales-stock-openings"] }),
      queryClient.invalidateQueries({ queryKey: ["master-stock-warehouse"] }),
      queryClient.invalidateQueries({ queryKey: ["visit-sales-stock"] }),\n      queryClient.invalidateQueries({ queryKey: ["sales-current-stock"] })
    ]); 
  }

  async function handleLoadStock(e: React.FormEvent) {
    e.preventDefault();
    if (!isOwner) return;
    if (!salesUserId) return toast.error("Pilih Sales tujuan.");
    if (!loadProductId) return toast.error("Pilih produk yang dimuat.");
    const prod = products.find((p) => p.id === loadProductId);
    const pSize = Math.max(1, Number(prod?.pcs_per_pack ?? 1));
    const totalPcs = (Number(loadPacks) || 0) * pSize + (Number(loadPcs) || 0);
    if (totalPcs <= 0) return toast.error("Masukkan jumlah muatan minimal 1 pcs.");
    setBusy(true);
    try {
      const { error } = await supabase.rpc("record_sales_morning_load", {
        _sales_user_id: salesUserId,
        _items: [{ product_id: loadProductId, quantity: totalPcs }],
        _stock_date: stockDate,
        _occurred_at: new Date().toISOString(),
      } as any);
      if (error) throw error;
      toast.success(`Berhasil memuat ${totalPcs} pcs ke Sales.`);
      setLoadProductId(""); setLoadPacks(""); setLoadPcs("");
      setLoadFormOpen(false);
      await refresh();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
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
        _occurred_at: new Date().toISOString(),
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
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-blue-700">
          <Truck className="h-6 w-6" />
        </div>
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-blue-700">Stok Sales</div>
          <h1 className="text-2xl font-bold tracking-tight">Stok yang Dibawa Sales</h1>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Pantau stok fisik yang saat ini berada di tangan sales. Muatan dihitung dari seluruh pergerakan stok.
          </p>
        </div>
      </header>

      <section className="mt-4 rounded-2xl border bg-card p-4 shadow-sm">
        {account?.role === "owner" ? (
          <label className="text-xs font-medium">
            Pilih Sales
            <select
              value={salesUserId}
              onChange={(e) => setSalesUserId(e.target.value)}
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

        <div className="mt-3 flex items-center justify-between rounded-xl border bg-blue-50/60 border-blue-100 px-3 py-3">
          <div>
            <div className="text-[11px] text-muted-foreground">Total stok di tangan</div>
            <div className="mt-0.5 text-xl font-bold text-foreground">
              {totalSalesStock.toLocaleString("id-ID")} pcs
            </div>
          </div>
          <Truck className="h-5 w-5 text-blue-700" />
        </div>
      </section>

      {isOwner && (
        <section className="mt-4 rounded-2xl border border-blue-200 bg-blue-50/40 p-4 shadow-sm">
          <button
            type="button"
            onClick={() => setLoadFormOpen((open) => !open)}
            className="flex w-full items-center justify-between text-left"
          >
            <div className="flex items-center gap-2 font-semibold text-blue-900">
              <Plus className="h-4 w-4" />
              Input Stok dari Gudang ke Sales
            </div>
            {loadFormOpen ? <ChevronUp className="h-4 w-4 text-blue-700" /> : <ChevronDown className="h-4 w-4 text-blue-700" />}
          </button>

          {loadFormOpen && (
            <form onSubmit={handleLoadStock} className="mt-4 space-y-3">
              <div className="text-xs leading-relaxed text-blue-800/80">
                Muat barang dari Gudang Utama ke Sales yang dipilih. Stok Gudang akan berkurang dan stok Sales bertambah.
              </div>

              <select
                required
                value={salesUserId}
                onChange={(e) => setSalesUserId(e.target.value)}
                className="h-11 w-full rounded-xl border bg-background px-3 text-sm"
              >
                <option value="">Pilih Sales</option>
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.profiles?.display_name || m.profiles?.username || m.user_id.slice(0, 8)}
                  </option>
                ))}
              </select>

              <select
                required
                value={loadProductId}
                onChange={(e) => setLoadProductId(e.target.value)}
                className="h-11 w-full rounded-xl border bg-background px-3 text-sm"
              >
                <option value="">Pilih Produk</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>

              <div className="grid grid-cols-2 gap-2">
                <Input
                  inputMode="numeric"
                  min="0"
                  value={loadPacks}
                  onChange={(e) => setLoadPacks(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="Jumlah pack"
                  className="h-11"
                />
                <Input
                  inputMode="numeric"
                  min="0"
                  value={loadPcs}
                  onChange={(e) => setLoadPcs(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="Tambahan pcs"
                  className="h-11"
                />
              </div>

              <Button type="submit" disabled={busy || !salesUserId || !loadProductId} className="h-11 w-full rounded-xl">
                {busy ? "Memproses…" : "Muat Stok ke Sales"}
              </Button>
            </form>
          )}
        </section>
      )}

      <section className="mt-4 rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Rincian Stok</div>
            <div className="mt-0.5 text-xs text-muted-foreground">Barang yang sedang dibawa sales</div>
          </div>
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
        </div>

        {stockRows.length > 0 ? (
          <div className="mt-3 divide-y rounded-xl border">
            {stockRows.map((x) => (
              <div key={x.product.id} className="flex items-center justify-between gap-3 px-3 py-3">
                <span className="min-w-0 truncate text-sm font-medium">{x.product.name}</span>
                <span className="shrink-0 font-mono text-sm font-bold">{x.qty.toLocaleString("id-ID")} pcs</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-3 rounded-xl border border-dashed p-5 text-center text-xs text-muted-foreground">
            Tidak ada stok yang sedang dibawa sales.
          </div>
        )}
      </section>

      {isOwner && <section className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
            <RefreshCw className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-bold text-emerald-900">Kembalikan ke Gudang</h2>
            <p className="mt-1 text-xs leading-relaxed text-emerald-800/80">
              Kembalikan seluruh sisa stok yang masih dibawa sales ke Gudang Utama.
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          disabled={busy || !salesUserId || totalSalesStock <= 0}
          onClick={handleReturnStock}
          className="mt-4 h-11 w-full rounded-xl border-emerald-600/30 bg-background text-emerald-700 hover:bg-emerald-100"
        >
          {busy ? "Memproses…" : "Kembalikan Semua Stok ke Gudang"}
        </Button>
      </section>}
    </main>
  );}
