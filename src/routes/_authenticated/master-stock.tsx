import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Boxes, Building2, Package, Search, Store, Users, Warehouse } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/master-stock")({
  head: () => ({ meta: [{ title: "Master Stok — Sales Pouch" }] }),
  component: MasterStockPage,
});

type Setup = { id: string; mode: "migration" | "from_start"; status: "active" | "finalized" };
type ProductStock = { product_id: string; product_name: string; global_quantity: number };
type Location = { id: string; name: string; location_type: "warehouse" | "outlet" | "sales" };
type Opening = { product_id: string; location_id: string; quantity: number };
type Movement = { product_id: string; from_location_id: string | null; to_location_id: string | null; quantity: number };

function MasterStockPage() {
  const { data: account, isLoading: accountLoading } = useProfile();
  const [search, setSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState<"all" | "warehouse" | "outlet" | "sales">("all");

  const { data: setup, isLoading: setupLoading } = useQuery<Setup | null>({
    queryKey: ["master-stock-setup", account?.ownerId],
    enabled: !!account?.ownerId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("stock_setups").select("id,mode,status").eq("owner_id", account!.ownerId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: global = [] } = useQuery<ProductStock[]>({
    queryKey: ["master-stock-global", account?.ownerId],
    enabled: !!account?.ownerId && setup?.status === "finalized",
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("master_stock_global").select("product_id,product_name,global_quantity").eq("owner_id", account!.ownerId).order("product_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ["master-stock-locations", account?.ownerId],
    enabled: !!account?.ownerId && setup?.status === "finalized",
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("stock_locations").select("id,name,location_type").eq("owner_id", account!.ownerId).eq("is_active", true).order("location_type").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: openings = [] } = useQuery<Opening[]>({
    queryKey: ["master-stock-openings", setup?.id],
    enabled: !!setup?.id && setup.status === "finalized",
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("stock_opening_items").select("product_id,location_id,quantity").eq("setup_id", setup!.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: movements = [] } = useQuery<Movement[]>({
    queryKey: ["master-stock-movements", account?.ownerId],
    enabled: !!account?.ownerId && setup?.status === "finalized",
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("stock_movements").select("product_id,from_location_id,to_location_id,quantity").eq("owner_id", account!.ownerId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const productCount = global.length;
  const globalTotal = useMemo(() => global.reduce((sum, row) => sum + Math.max(0, Number(row.global_quantity) || 0), 0), [global]);

  const locationTotals = useMemo(() => {
    const totals = new Map<string, number>();
    locations.forEach((l) => totals.set(l.id, 0));
    openings.forEach((x) => totals.set(x.location_id, (totals.get(x.location_id) ?? 0) + Number(x.quantity || 0)));
    movements.forEach((x) => {
      if (x.from_location_id) totals.set(x.from_location_id, (totals.get(x.from_location_id) ?? 0) - Number(x.quantity || 0));
      if (x.to_location_id) totals.set(x.to_location_id, (totals.get(x.to_location_id) ?? 0) + Number(x.quantity || 0));
    });
    return locations.map((l) => ({ ...l, quantity: Math.max(0, totals.get(l.id) ?? 0) }));
  }, [locations, openings, movements]);

  const visibleProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return global.filter((p) => {
      if (q && !p.product_name.toLowerCase().includes(q)) return false;
      if (locationFilter === "all") return true;
      const ids = new Set(locationTotals.filter((l) => l.location_type === locationFilter).map((l) => l.id));
      const openingQty = openings.filter((x) => x.product_id === p.product_id && ids.has(x.location_id)).reduce((s, x) => s + Number(x.quantity || 0), 0);
      const movementQty = movements.filter((x) => x.product_id === p.product_id).reduce((s, x) => s + (x.to_location_id && ids.has(x.to_location_id) ? Number(x.quantity || 0) : 0) - (x.from_location_id && ids.has(x.from_location_id) ? Number(x.quantity || 0) : 0), 0);
      return openingQty + movementQty > 0;
    });
  }, [global, search, locationFilter, locationTotals, openings, movements]);

  if (accountLoading || setupLoading) return <main className="mx-auto max-w-md px-4 pt-12 text-center text-sm text-muted-foreground">Memuat Master Stok…</main>;
  if (account?.role !== "owner") return <main className="mx-auto max-w-md px-4 pt-12 text-center text-destructive">Master Stok hanya dapat dilihat Owner.</main>;

  if (!setup) return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-10 pt-5">
      <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" /> Kembali</Link>
      <header className="mt-5 flex items-start gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100 text-blue-700"><Boxes className="h-6 w-6" /></div><div><h1 className="text-2xl font-bold tracking-tight">Master Stok</h1><p className="mt-1 text-sm text-muted-foreground">Mulai dari Stok Pembukaan sebelum melihat stok global.</p></div></header>
      <section className="mt-6 rounded-2xl border bg-card p-5 text-center shadow-sm"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-100 text-orange-700"><Boxes className="h-7 w-7" /></div><h2 className="mt-4 text-lg font-bold">Stok Pembukaan</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Tentukan mode usaha dan catat stok fisik awal per Gudang, Toko, atau Sales. Setelah final, halaman ini otomatis berubah menjadi monitoring Stok Global.</p><Button asChild className="mt-5 h-11 w-full rounded-xl"><Link to="/stock-opening">Mulai Stok Pembukaan</Link></Button></section>
    </main>
  );

  if (setup.status === "active") return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-10 pt-5">
      <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" /> Kembali</Link>
      <header className="mt-5"><div className="font-mono text-[11px] uppercase tracking-[0.2em] text-blue-700">Master Stok</div><h1 className="mt-1 text-2xl font-bold tracking-tight">Stok Pembukaan</h1><p className="mt-1 text-sm text-muted-foreground">Setup sedang berjalan. Lanjutkan pengisian, lalu setelah final Master Stok akan menampilkan stok global.</p></header>
      <section className="mt-5 rounded-2xl border bg-card p-5 shadow-sm"><div className="flex items-center gap-3"><div className="rounded-xl bg-orange-100 p-3 text-orange-700"><Boxes className="h-5 w-5" /></div><div><div className="text-xs text-muted-foreground">Mode</div><b>{setup.mode === "migration" ? "Migrasi Usaha" : "Mulai dari Awal"}</b></div></div><Button asChild className="mt-5 h-11 w-full rounded-xl"><Link to="/stock-opening">Lanjutkan Stok Pembukaan</Link></Button></section>
    </main>
  );

  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-10 pt-5">
      <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" /> Kembali</Link>
      <header className="mt-5 flex items-center gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100 text-blue-700"><Boxes className="h-6 w-6" /></div><div><div className="font-mono text-[11px] uppercase tracking-[0.2em] text-blue-700">Master Stok</div><h1 className="text-2xl font-bold tracking-tight">Stok Global</h1></div></header>

      <section className="mt-5 rounded-2xl border bg-card p-5 shadow-sm"><div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Total semua lokasi</div><div className="mt-1 text-4xl font-bold tracking-tight">{globalTotal.toLocaleString("id-ID")} <span className="text-lg font-medium text-muted-foreground">pcs</span></div><div className="mt-1 text-sm text-muted-foreground">{productCount} produk tercatat</div></section>

      <section className="mt-3 grid grid-cols-3 gap-2"><div className="rounded-xl border bg-card p-3"><Warehouse className="h-5 w-5 text-orange-700" /><div className="mt-2 text-[11px] text-muted-foreground">Gudang</div><b>{locationTotals.filter((l) => l.location_type === "warehouse").reduce((s, l) => s + l.quantity, 0).toLocaleString("id-ID")}</b></div><div className="rounded-xl border bg-card p-3"><Store className="h-5 w-5 text-emerald-700" /><div className="mt-2 text-[11px] text-muted-foreground">Toko</div><b>{locationTotals.filter((l) => l.location_type === "outlet").reduce((s, l) => s + l.quantity, 0).toLocaleString("id-ID")}</b></div><div className="rounded-xl border bg-card p-3"><Users className="h-5 w-5 text-blue-700" /><div className="mt-2 text-[11px] text-muted-foreground">Sales</div><b>{locationTotals.filter((l) => l.location_type === "sales").reduce((s, l) => s + l.quantity, 0).toLocaleString("id-ID")}</b></div></section>

      <section className="mt-5"><div className="mb-2 px-1 text-sm font-semibold">Stok per Produk</div><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari produk…" className="h-11 rounded-xl pl-9" /></div><div className="mt-2 flex gap-2 overflow-x-auto pb-1">{([["all", "Semua"], ["warehouse", "Gudang"], ["outlet", "Toko"], ["sales", "Sales"]] as const).map(([value, label]) => <Button key={value} type="button" variant={locationFilter === value ? "default" : "outline"} size="sm" className="shrink-0 rounded-full" onClick={() => setLocationFilter(value)}>{label}</Button>)}</div><div className="mt-3 space-y-2">{visibleProducts.map((p) => <div key={p.product_id} className="rounded-xl border bg-card p-3"><div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700"><Package className="h-5 w-5" /></div><div className="min-w-0"><div className="truncate text-sm font-semibold">{p.product_name}</div><div className="text-xs text-muted-foreground">Stok global</div></div></div><div className="text-right"><div className="text-lg font-bold">{Number(p.global_quantity).toLocaleString("id-ID")}</div><div className="text-[10px] text-muted-foreground">pcs</div></div></div></div>)}{visibleProducts.length === 0 && <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Tidak ada produk yang cocok.</div>}</div></section>

      <section className="mt-5 rounded-xl border bg-muted/40 p-3 text-xs leading-5 text-muted-foreground"><div className="flex items-center gap-2 font-semibold text-foreground"><Building2 className="h-4 w-4" /> Monitoring stok</div><p className="mt-1">Master Stok hanya untuk melihat posisi stok. Perubahan stok berikutnya dilakukan melalui transaksi stok, bukan dari halaman ini.</p></section>
    </main>
  );
}
