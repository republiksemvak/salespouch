import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  ArrowLeft,
  Boxes,
  Building2,
  CheckCircle2,
  ClipboardPlus,
  HelpCircle,
  Package,
  Plus,
  Search,
  Store,
  Truck
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { getOwnerProducts } from "@/lib/team.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatQty, packSize, toPieces } from "@/lib/units";
import { useTeamPermissions } from "@/hooks/use-team-permissions";
import { hasAccess } from "@/lib/team-access";

export const Route = createFileRoute("/_authenticated/master-stock")({
  head: () => ({
    meta: [
      { title: "Stok Gudang — Sales Pouch" },
      { name: "description", content: "Pantau dan catat stok fisik setiap produk di seluruh lokasi usaha." },
      { property: "og:title", content: "Stok Gudang — Sales Pouch" },
      { property: "og:description", content: "Pantau dan catat stok fisik setiap produk di seluruh lokasi usaha." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" }
    ]
  }),
  component: MasterStockPage
});

type Setup = { id: string; mode: "migration" | "from_start"; status: "active" | "finalized" };
type ProductStock = { product_id: string; product_name: string; warehouse_stock: number };
type Product = { id: string; name: string; pcs_per_pack: number };
type Location = { id: string; name: string; location_type: "warehouse" | "outlet" | "sales" };
type Opening = { product_id: string; location_id: string; quantity: number };
type Movement = { product_id: string; from_location_id: string | null; to_location_id: string | null; quantity: number };

const locationLabel = (type: Location["location_type"]) =>
  type === "warehouse" ? "Gudang" : type === "outlet" ? "Toko" : "Sales";

function MasterStockPage() {
  const { data: account, isLoading: accountLoading } = useProfile();
  const queryClient = useQueryClient();
  const fetchOwnerProducts = useServerFn(getOwnerProducts);
  const { data: access } = useTeamPermissions(account?.role === "manager" || account?.role === "admin");
  const permissions = access?.permissions ?? [];

  const [search, setSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState<"all" | "warehouse" | "outlet" | "sales">("all");
  const [showGuide, setShowGuide] = useState(false);

  const [showProduction, setShowProduction] = useState(false);
  const [productionLocation, setProductionLocation] = useState("");
  const [productionProduct, setProductionProduct] = useState("");
  const [productionPack, setProductionPack] = useState("");
  const [productionPcs, setProductionPcs] = useState("");
  const [productionDate, setProductionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [productionNote, setProductionNote] = useState("");
  const [savingProduction, setSavingProduction] = useState(false);
  const [productionMessage, setProductionMessage] = useState("");

  const [showDamage, setShowDamage] = useState(false);
  const [damageLocation, setDamageLocation] = useState("");
  const [damageProduct, setDamageProduct] = useState("");
  const [damagePack, setDamagePack] = useState("");
  const [damagePcs, setDamagePcs] = useState("");
  const [damageDate, setDamageDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [damageNote, setDamageNote] = useState("");
  const [savingDamage, setSavingDamage] = useState(false);
  const [damageMessage, setDamageMessage] = useState("");

  const [showOpening, setShowOpening] = useState(false);
  const [openingLocation, setOpeningLocation] = useState("");
  const [openingProduct, setOpeningProduct] = useState("");
  const [openingPack, setOpeningPack] = useState("");
  const [openingPcs, setOpeningPcs] = useState("");
  const [openingNote, setOpeningNote] = useState("");
  const [savingOpening, setSavingOpening] = useState(false);
  const [openingMessage, setOpeningMessage] = useState("");

  const { data: setup, isLoading: setupLoading } = useQuery<Setup | null>({
    queryKey: ["master-stock-setup", account?.ownerId],
    enabled: !!account?.ownerId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("stock_setups")
        .select("id,mode,status")
        .eq("owner_id", account!.ownerId)
        .maybeSingle();
      if (error) throw error;
      return data;
    }
  });

  const { data: global = [] } = useQuery<ProductStock[]>({
    queryKey: ["master-stock-warehouse", account?.ownerId],
    enabled: !!account?.ownerId && setup?.status === "finalized",
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("warehouse_stock_ledger")
        .select("product_id,product_name,warehouse_stock")
        .eq("owner_id", account!.ownerId)
        .order("product_name");
      if (error) throw error;
      return data ?? [];
    }
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["master-stock-products", account?.ownerId],
    enabled: !!account?.ownerId && setup?.status === "finalized",
    queryFn: async () => {
      const data = await fetchOwnerProducts();
      return (data ?? [])
        .filter((p: any) => p.is_active !== false)
        .map((p: any) => ({ id: p.id, name: p.name, pcs_per_pack: Math.max(1, Number(p.pcs_per_pack) || 1) }));
    }
  });

  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ["master-stock-locations", account?.ownerId],
    enabled: !!account?.ownerId && setup?.status === "finalized",
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("stock_locations")
        .select("id,name,location_type")
        .eq("owner_id", account!.ownerId)
        .eq("is_active", true)
        .order("location_type")
        .order("name");
      if (error) throw error;
      return data ?? [];
    }
  });

  const { data: openings = [] } = useQuery<Opening[]>({
    queryKey: ["master-stock-openings", setup?.id],
    enabled: !!setup?.id && setup.status === "finalized",
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("stock_opening_items")
        .select("product_id,location_id,quantity")
        .eq("setup_id", setup!.id);
      if (error) throw error;
      return data ?? [];
    }
  });

  const { data: movements = [] } = useQuery<Movement[]>({
    queryKey: ["master-stock-movements", account?.ownerId],
    enabled: !!account?.ownerId && setup?.status === "finalized",
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("stock_movements")
        .select("product_id,from_location_id,to_location_id,quantity")
        .eq("owner_id", account!.ownerId);
      if (error) throw error;
      return data ?? [];
    }
  });

  const selectedProductionProduct = products.find((p) => p.id === productionProduct);
  const productionPackSize = selectedProductionProduct?.pcs_per_pack ?? 1;
  const productionPacks = Math.max(0, Number(productionPack) || 0);
  const productionRemainder = Math.max(0, Number(productionPcs) || 0);
  const productionQuantity = productionPacks * productionPackSize + productionRemainder;

  const selectedDamageProduct = products.find((p) => p.id === damageProduct);
  const damagePackSize = selectedDamageProduct?.pcs_per_pack ?? 1;
  const damagePacks = Math.max(0, Number(damagePack) || 0);
  const damageRemainder = Math.max(0, Number(damagePcs) || 0);
  const damageQuantity = damagePacks * damagePackSize + damageRemainder;

  const selectedOpeningProduct = products.find((p) => p.id === openingProduct);
  const openingPackSize = packSize(selectedOpeningProduct?.pcs_per_pack);
  const openingQuantity = toPieces(Math.max(0, Number(openingPack) || 0), Math.max(0, Number(openingPcs) || 0), openingPackSize);

  const stockByProduct = useMemo(() => {
    const result = new Map<string, number>();
    global.forEach((row) => result.set(row.product_id, Math.max(0, Number(row.warehouse_stock) || 0)));
    return result;
  }, [global]);

  const productCount = products.length;
  const globalTotal = useMemo(() => products.reduce((sum, p) => sum + (stockByProduct.get(p.id) ?? 0), 0), [products, stockByProduct]);

  const productLocationStock = useMemo(() => {
    const result = new Map<string, Map<string, number>>();
    const add = (productId: string, locationId: string, amount: number) => {
      if (!result.has(productId)) result.set(productId, new Map());
      const byLocation = result.get(productId)!;
      byLocation.set(locationId, (byLocation.get(locationId) ?? 0) + amount);
    };
    openings.forEach((x) => add(x.product_id, x.location_id, Number(x.quantity) || 0));
    movements.forEach((x) => {
      if (x.from_location_id) add(x.product_id, x.from_location_id, -(Number(x.quantity) || 0));
      if (x.to_location_id) add(x.product_id, x.to_location_id, Number(x.quantity) || 0);
    });
    return result;
  }, [openings, movements]);

  const visibleProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q)) return false;
      if (locationFilter === "all") return true;
      const byLocation = productLocationStock.get(p.id);
      return locations.filter((l) => l.location_type === locationFilter).some((l) => (byLocation?.get(l.id) ?? 0) > 0);
    });
  }, [products, search, locationFilter, productLocationStock, locations]);

  const saveProduction = async () => {
    setProductionMessage("");
    if (!productionLocation || !productionProduct || productionQuantity <= 0) {
      setProductionMessage("Pilih Gudang, produk, dan isi jumlah stok lebih dari 0.");
      return;
    }
    if (!/^\d*$/.test(productionPack) || !/^\d*$/.test(productionPcs) || productionRemainder >= productionPackSize) {
      setProductionMessage(`Sisa pcs harus 0–${productionPackSize - 1} untuk produk ini.`);
      return;
    }
    setSavingProduction(true);
    const { error } = await (supabase as any).from("stock_movements").insert({
      owner_id: account!.ownerId,
      product_id: productionProduct,
      movement_type: "production",
      from_location_id: null,
      to_location_id: productionLocation,
      quantity: productionQuantity,
      reference_type: "production",
      notes: productionNote.trim() || null,
      occurred_at: new Date(`${productionDate}T12:00:00`).toISOString()
    });
    setSavingProduction(false);
    if (error) {
      setProductionMessage(error.message || "Gagal menyimpan stok distribusi.");
      return;
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["master-stock-warehouse", account?.ownerId] }),
      queryClient.invalidateQueries({ queryKey: ["master-stock-movements", account?.ownerId] })
    ]);
    setProductionPack("");
    setProductionPcs("");
    setProductionNote("");
    setProductionMessage(`Stok distribusi ${productionQuantity.toLocaleString("id-ID")} pcs berhasil ditambahkan.`);
  };

  const saveDamage = async () => {
    setDamageMessage("");
    if (!damageLocation || !damageProduct || damageQuantity <= 0) {
      setDamageMessage("Pilih Gudang, produk, dan isi jumlah barang rusak lebih dari 0.");
      return;
    }
    if (!/^\d*$/.test(damagePack) || !/^\d*$/.test(damagePcs) || damageRemainder >= damagePackSize) {
      setDamageMessage(`Sisa pcs harus 0–${damagePackSize - 1} untuk produk ini.`);
      return;
    }
    setSavingDamage(true);
    const { error } = await (supabase as any).from("stock_movements").insert({
      owner_id: account!.ownerId,
      product_id: damageProduct,
      movement_type: "damage",
      from_location_id: damageLocation,
      to_location_id: null,
      quantity: damageQuantity,
      reference_type: null,
      notes: damageNote.trim() || "Pemusnahan barang rusak / BS",
      occurred_at: new Date(`${damageDate}T12:00:00`).toISOString()
    });
    setSavingDamage(false);
    if (error) {
      setDamageMessage(error.message || "Gagal memproses pemusnahan barang rusak.");
      return;
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["master-stock-warehouse", account?.ownerId] }),
      queryClient.invalidateQueries({ queryKey: ["master-stock-movements", account?.ownerId] })
    ]);
    setDamagePack("");
    setDamagePcs("");
    setDamageNote("");
    setDamageMessage(`Barang rusak ${damageQuantity.toLocaleString("id-ID")} pcs berhasil dimusnahkan dan memotong gudang.`);
  };

  const saveOpeningSnapshot = async () => {
    setOpeningMessage("");
    if (!openingLocation || !openingProduct) {
      setOpeningMessage("Pilih lokasi dan produk terlebih dahulu.");
      return;
    }
    if (!/^\d*$/.test(openingPack) || !/^\d*$/.test(openingPcs) || Number(openingPcs || 0) >= openingPackSize) {
      setOpeningMessage(`Sisa pcs harus 0–${openingPackSize - 1} untuk produk ini.`);
      return;
    }
    if (openingPack === "" && openingPcs === "") {
      setOpeningMessage("Isi jumlah fisik dalam pack atau pcs.");
      return;
    }
    if (openingNote.trim().length > 250) {
      setOpeningMessage("Catatan maksimal 250 karakter.");
      return;
    }
    setSavingOpening(true);
    const { error } = await (supabase as any).rpc("record_physical_opening_snapshot", {
      _location_id: openingLocation,
      _product_id: openingProduct,
      _physical_quantity: openingQuantity,
      _counted_at: new Date().toISOString(),
      _note: openingNote.trim() || null
    });
    setSavingOpening(false);
    if (error) {
      setOpeningMessage(error.message || "Stok awal gagal disimpan.");
      return;
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["master-stock-warehouse", account?.ownerId] }),
      queryClient.invalidateQueries({ queryKey: ["master-stock-movements", account?.ownerId] }),
      queryClient.invalidateQueries({ queryKey: ["visit-sales-stock"] })
    ]);
    setOpeningPack("");
    setOpeningPcs("");
    setOpeningNote("");
    setOpeningMessage(`Snapshot fisik ${formatQty(openingQuantity, openingPackSize)} berhasil disimpan.`);
  };

  if (accountLoading || setupLoading) return <main className="mx-auto max-w-md px-4 pt-12 text-center text-sm text-muted-foreground">Memuat Stok Gudang…</main>;
  const canOpen = true;
  const canOpening = account?.role === "owner" || hasAccess(permissions, "master_stock.opening");
  const canIncoming = account?.role === "owner" || hasAccess(permissions, "master_stock.incoming");
  const canDamage = account?.role === "owner" || hasAccess(permissions, "master_stock.damage");
  const canReset = account?.role === "owner" || hasAccess(permissions, "master_stock.reset");
  if (!canOpen) return <main className="mx-auto max-w-md px-4 pt-12 text-center text-destructive">Akses Stok Gudang belum diberikan Owner.</main>;

  if (!setup) return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-10 pt-5">
      <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" /> Kembali</Link>
      <header className="mt-5 flex items-start gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100 text-blue-700"><Boxes className="h-6 w-6" /></div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Stok Gudang</h1>
          <p className="mt-1 text-sm text-muted-foreground">Mulai dari Stok Pembukaan sebelum memantau stok Gudang.</p>
        </div>
      </header>
      <section className="mt-6 rounded-2xl border bg-card p-5 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-100 text-orange-700"><Boxes className="h-7 w-7" /></div>
        <h2 className="mt-4 text-lg font-bold">Stok Pembukaan</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Tentukan mode usaha dan catat stok fisik awal per Gudang, Toko, atau Sales. Setelah final, halaman ini otomatis berubah menjadi monitoring Stok Gudang.</p>
        {canOpening && <Button asChild className="mt-5 h-11 w-full rounded-xl"><Link to="/stock-opening">Mulai Stok Pembukaan</Link></Button>}
      </section>
    </main>
  );

  if (setup.status === "active") return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-10 pt-5">
      <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" /> Kembali</Link>
      <header className="mt-5">
        <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-blue-700">Stok Gudang</div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Stok Pembukaan</h1>
        <p className="mt-1 text-sm text-muted-foreground">Setup sedang berjalan. Lanjutkan pengisian, lalu setelah final Stok Gudang akan menampilkan stok Gudang.</p>
      </header>
      <section className="mt-5 rounded-2xl border bg-card p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-orange-100 p-3 text-orange-700"><Boxes className="h-5 w-5" /></div>
          <div>
            <div className="text-xs text-muted-foreground">Mode</div>
            <b>{setup.mode === "migration" ? "Migrasi Usaha" : "Mulai dari Awal"}</b>
          </div>
        </div>
        {canOpening && <Button asChild className="mt-5 h-11 w-full rounded-xl"><Link to="/stock-opening">Lanjutkan Stok Pembukaan</Link></Button>}
      </section>
    </main>
  );

  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-10 pt-5">
      <div className="flex items-center justify-between">
        <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Kembali
        </Link>
        <button
          type="button"
          onClick={() => setShowGuide(true)}
          className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors"
        >
          <HelpCircle className="h-3.5 w-3.5" /> Panduan Alur
        </button>
      </div>

      <header className="mt-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-100 text-blue-700 shrink-0">
            <Boxes className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-blue-700">Stok Gudang</div>
            <h1 className="text-2xl font-bold tracking-tight truncate">Stok Produk</h1>
          </div>
        </div>
{canOpening && <Button type="button" size="sm" className="shrink-0 rounded-xl" onClick={() => { setShowOpening(true); setOpeningMessage(""); }}>
          <ClipboardPlus className="mr-1 h-4 w-4" /> Stok Awal
        </Button>}
      </header>

      <section className="mt-4 rounded-2xl border bg-card p-4 shadow-sm">
        <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Ringkasan Distribusi & Stok</div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-muted/40 p-2.5">
            <div className="text-[10px] uppercase font-semibold text-muted-foreground">Gudang</div>
            <div className="mt-0.5 text-base font-bold text-foreground">{globalTotal.toLocaleString("id-ID")} <span className="text-[10px] font-normal text-muted-foreground">pcs</span></div>
            <div className="mt-1 text-[10px] text-muted-foreground">{productCount.toLocaleString("id-ID")} produk</div>
          </div>
          <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-2.5">
            <div className="text-[10px] uppercase font-semibold text-blue-700">Dipegang Sales</div>
            <div className="mt-0.5 text-base font-bold text-blue-900">
              {products.reduce((acc, product) => {
                const byLoc = productLocationStock.get(product.id);
                return acc + locations.filter((location) => location.location_type === "sales").reduce((sum, location) => sum + (byLoc?.get(location.id) ?? 0), 0);
              }, 0).toLocaleString("id-ID")} <span className="text-[10px] font-normal text-blue-700">pcs</span>
            </div>
          </div>
          <div className="rounded-xl bg-muted/40 p-2.5">
            <div className="text-[10px] uppercase font-semibold text-muted-foreground">Dititip Toko</div>
            <div className="mt-0.5 text-base font-bold text-foreground">
              {products.reduce((acc, product) => {
                const byLoc = productLocationStock.get(product.id);
                return acc + locations.filter((location) => location.location_type === "outlet").reduce((sum, location) => sum + (byLoc?.get(location.id) ?? 0), 0);
              }, 0).toLocaleString("id-ID")} <span className="text-[10px] font-normal text-muted-foreground">pcs</span>
            </div>
          </div>
        </div>
      </section>

{canIncoming && (
      <section className="mt-3 rounded-2xl border bg-blue-50/50 p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-foreground">Tambah Stok Baru / Distribusi</div>
            <p className="mt-0.5 text-xs text-muted-foreground">Gunakan ini untuk barang masuk baru (hasil produksi atau belanja pabrik).</p>
          </div>
          <Button type="button" variant={showProduction ? "secondary" : "default"} size="sm" className="shrink-0 rounded-xl" onClick={() => { setShowProduction((v) => !v); setProductionMessage(""); }}>
            {showProduction ? "Tutup" : <><Plus className="mr-1 h-3.5 w-3.5" /> Tambah</>}
          </Button>
        </div>

        {showProduction && (
          <div className="mt-4 space-y-3 border-t pt-4">
            <div>
              <label className="mb-1 block text-xs font-medium">Gudang Tujuan</label>
              <select value={productionLocation} onChange={(e) => setProductionLocation(e.target.value)} className="h-11 w-full rounded-xl border bg-background px-3 text-sm">
                <option value="">Pilih Gudang…</option>
                {locations.filter((l) => l.location_type === "warehouse").map((l) => <option key={l.id} value={l.id}>{l.name} (Gudang)</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Produk</label>
              <select value={productionProduct} onChange={(e) => { setProductionProduct(e.target.value); setProductionPack(""); setProductionPcs(""); }} className="h-11 w-full rounded-xl border bg-background px-3 text-sm">
                <option value="">Pilih produk…</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name} — 1 pack = {p.pcs_per_pack} pcs</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium">Pack</label>
                <Input type="number" min="0" step="1" value={productionPack} onChange={(e) => setProductionPack(e.target.value)} placeholder="0" className="h-11 rounded-xl" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Pcs Sisa</label>
                <Input type="number" min="0" step="1" value={productionPcs} onChange={(e) => setProductionPcs(e.target.value)} placeholder="0" className="h-11 rounded-xl" />
              </div>
            </div>
            {productionProduct && (
              <div className="rounded-xl bg-background/80 px-3 py-2 text-xs text-muted-foreground border">
                Total fisik masuk: <b className="text-foreground">{productionQuantity.toLocaleString("id-ID")} pcs</b> (maks sisa: {productionPackSize - 1})
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs font-medium">Tanggal Masuk</label>
              <Input type="date" value={productionDate} onChange={(e) => setProductionDate(e.target.value)} className="h-11 rounded-xl" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Catatan <span className="font-normal text-muted-foreground">(opsional)</span></label>
              <Input value={productionNote} onChange={(e) => setProductionNote(e.target.value)} placeholder="Contoh: Produksi batch pagi / kiriman supplier" className="h-11 rounded-xl" />
            </div>
            {productionMessage && (
              <div className={`rounded-xl px-3 py-2 text-xs ${productionMessage.includes("berhasil") ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                {productionMessage}
              </div>
            )}
            <Button type="button" disabled={savingProduction} className="h-11 w-full rounded-xl" onClick={saveProduction}>
              {savingProduction ? "Menyimpan…" : "Simpan Stok Masuk"}
            </Button>
          </div>
        )}
      </section>

      )}

{canDamage && (
      <section className="mt-3 rounded-2xl border border-rose-200 bg-rose-50/50 p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5 text-sm font-bold text-rose-900">
              <AlertTriangle className="h-4 w-4" /> Barang Rusak / BS
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">Keluarkan barang rusak, bocor, atau expired dari stok Gudang.</p>
          </div>
          <Button type="button" variant={showDamage ? "secondary" : "outline"} size="sm" className="shrink-0 rounded-xl text-rose-700 border-rose-200" onClick={() => { setShowDamage((v) => !v); setDamageMessage(""); }}>
            {showDamage ? "Tutup" : "Catat"}
          </Button>
        </div>

        {showDamage && (
          <div className="mt-4 space-y-3 border-t border-rose-200 pt-4">
            <div>
              <label className="mb-1 block text-xs font-medium">Gudang Asal</label>
              <select value={damageLocation} onChange={(e) => setDamageLocation(e.target.value)} className="h-11 w-full rounded-xl border bg-background px-3 text-sm">
                <option value="">Pilih Gudang…</option>
                {locations.filter((l) => l.location_type === "warehouse").map((l) => <option key={l.id} value={l.id}>{l.name} (Gudang)</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Produk Rusak</label>
              <select value={damageProduct} onChange={(e) => { setDamageProduct(e.target.value); setDamagePack(""); setDamagePcs(""); }} className="h-11 w-full rounded-xl border bg-background px-3 text-sm">
                <option value="">Pilih produk…</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name} — 1 pack = {p.pcs_per_pack} pcs</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium">Pack</label>
                <Input type="number" min="0" step="1" value={damagePack} onChange={(e) => setDamagePack(e.target.value)} placeholder="0" className="h-11 rounded-xl" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Pcs Sisa</label>
                <Input type="number" min="0" step="1" value={damagePcs} onChange={(e) => setDamagePcs(e.target.value)} placeholder="0" className="h-11 rounded-xl" />
              </div>
            </div>
            {damageProduct && <div className="rounded-xl border border-rose-200 bg-background/80 px-3 py-2 text-xs text-rose-700">Total yang dimusnahkan: <b>{damageQuantity.toLocaleString("id-ID")} pcs</b> (mengurangi saldo gudang)</div>}
            <div>
              <label className="mb-1 block text-xs font-medium">Tanggal Pemusnahan</label>
              <Input type="date" value={damageDate} onChange={(e) => setDamageDate(e.target.value)} className="h-11 rounded-xl" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Alasan Kerusakan *</label>
              <Input required value={damageNote} onChange={(e) => setDamageNote(e.target.value)} placeholder="Contoh: Kemasan bocor / Expired" className="h-11 rounded-xl" />
            </div>
            {damageMessage && <div className={`rounded-xl px-3 py-2 text-xs ${damageMessage.includes("berhasil") ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{damageMessage}</div>}
            <Button type="button" disabled={savingDamage} className="h-11 w-full rounded-xl bg-rose-600 text-white hover:bg-rose-700" onClick={saveDamage}>
              {savingDamage ? "Memproses…" : "Musnahkan & Kurangi Stok Gudang"}
            </Button>
          </div>
        )}
      </section>

      )}

      <div className="mt-4 flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama produk…" className="h-11 rounded-xl pl-9" />
        </div>
        <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value as typeof locationFilter)} className="h-11 rounded-xl border bg-background px-3 text-sm">
          <option value="all">Semua</option>
          <option value="warehouse">Gudang</option>
          <option value="sales">Sales</option>
          <option value="outlet">Toko</option>
        </select>
      </div>

      <section className="mt-3 overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="divide-y">
          {visibleProducts.map((p) => {
            const byLocation = productLocationStock.get(p.id) ?? new Map<string, number>();
            return (
              <div key={p.id} className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{p.name}</div>
                    <div className="text-xs text-muted-foreground">1 pack = {p.pcs_per_pack} pcs</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-blue-700">{formatQty(stockByProduct.get(p.id) ?? 0, p.pcs_per_pack)}</div>
                    <div className="text-[11px] text-muted-foreground">Gudang</div>
                  </div>
                </div>
                {(() => {
                  const warehouseStock = locations.filter((location) => location.location_type === "warehouse")
                    .reduce((sum, location) => sum + (byLocation.get(location.id) ?? 0), 0);
                  const salesStock = locations.filter((location) => location.location_type === "sales")
                    .reduce((sum, location) => sum + (byLocation.get(location.id) ?? 0), 0);
                  const outletStock = locations.filter((location) => location.location_type === "outlet")
                    .reduce((sum, location) => sum + (byLocation.get(location.id) ?? 0), 0);

                  return (
                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                      <div className="rounded-xl bg-muted/40 p-2 text-center">
                        <div className="text-[10px] uppercase font-semibold text-muted-foreground">Gudang</div>
                        <div className="mt-0.5 font-semibold">{formatQty(warehouseStock, p.pcs_per_pack)}</div>
                      </div>
                      <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-2 text-center">
                        <div className="text-[10px] uppercase font-semibold text-blue-700">Total Sales</div>
                        <div className="mt-0.5 font-semibold text-blue-900">{formatQty(salesStock, p.pcs_per_pack)}</div>
                      </div>
                      <div className="rounded-xl bg-muted/40 p-2 text-center">
                        <div className="text-[10px] uppercase font-semibold text-muted-foreground">Toko</div>
                        <div className="mt-0.5 font-semibold">{formatQty(outletStock, p.pcs_per_pack)}</div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })}
          {visibleProducts.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">Tidak ada produk yang sesuai.</div>
          )}
        </div>
      </section>

      {canReset && <section className="mt-4 rounded-2xl border border-orange-200 bg-orange-50/60 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Pengaturan Stok Awal</div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Jika masih tahap mencoba atau salah mengisi Stok Awal, Owner dapat mengatur ulang sebelum ada transaksi berjalan.</p>
          </div>
          <Link to="/admin-stock-reset" className="shrink-0 text-sm font-semibold text-orange-700 underline underline-offset-4">Reset</Link>
        </div>
      </section>}

      <Dialog open={showOpening} onOpenChange={setShowOpening}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>Input Stok Awal (Opname)</DialogTitle>
            <DialogDescription>
              Menetapkan total fisik riil di lokasi yang dipilih. Bukan menambah, melainkan mengoreksi snapshot fisik.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <label className="mb-1 block text-xs font-medium">Lokasi Fisik</label>
              <select value={openingLocation} onChange={(e) => setOpeningLocation(e.target.value)} className="h-11 w-full rounded-xl border bg-background px-3 text-sm">
                <option value="">Pilih lokasi…</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name} — {locationLabel(l.location_type)}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Produk</label>
              <select value={openingProduct} onChange={(e) => { setOpeningProduct(e.target.value); setOpeningPack(""); setOpeningPcs(""); }} className="h-11 w-full rounded-xl border bg-background px-3 text-sm">
                <option value="">Pilih produk…</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name} — 1 pack = {p.pcs_per_pack} pcs</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium">Pack</label>
                <Input type="number" min="0" step="1" value={openingPack} onChange={(e) => setOpeningPack(e.target.value)} placeholder="0" className="h-11 rounded-xl" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Pcs Sisa</label>
                <Input type="number" min="0" step="1" value={openingPcs} onChange={(e) => setOpeningPcs(e.target.value)} placeholder="0" className="h-11 rounded-xl" />
              </div>
            </div>
            {openingProduct && (
              <div className="rounded-xl bg-muted/60 px-3 py-2 text-xs text-muted-foreground border">
                Total fisik diset ke: <b className="text-foreground">{openingQuantity.toLocaleString("id-ID")} pcs</b>
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs font-medium">Catatan <span className="font-normal text-muted-foreground">(opsional)</span></label>
              <Input value={openingNote} onChange={(e) => setOpeningNote(e.target.value)} placeholder="Contoh: Stok opname cut-off awal" className="h-11 rounded-xl" />
            </div>
            {openingMessage && (
              <div className={`rounded-xl px-3 py-2 text-xs ${openingMessage.includes("berhasil") ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                {openingMessage}
              </div>
            )}
            <Button type="button" disabled={savingOpening} className="h-11 w-full rounded-xl" onClick={saveOpeningSnapshot}>
              {savingOpening ? "Menyimpan…" : "Simpan Fisik Awal"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showGuide} onOpenChange={setShowGuide}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto rounded-2xl p-6">
          <DialogHeader>
            <div className="flex items-center gap-2 text-blue-700">
              <HelpCircle className="h-5 w-5" />
              <DialogTitle className="text-lg">Panduan Alur Stok Usaha Berjalan</DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground">
              Cara mengelola stok jika usaha Anda sudah berjalan dan barang sudah tersebar.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-3 space-y-4 text-xs leading-relaxed text-foreground">
            <div className="rounded-xl border bg-muted/30 p-3.5 space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-blue-800">
                <Boxes className="h-4 w-4" /> 1. Gudang Utama (Ditetapkan di Awal)
              </div>
              <p className="text-muted-foreground">
                Lakukan perhitungan fisik (opname) gudang sekali di awal, lalu simpan melalui tombol <b>Stok Awal</b>.
              </p>
              <p className="text-muted-foreground">
                <b>Setelah hari pertama:</b> Jangan pakai Stok Awal lagi. Setiap ada hasil produksi baru atau belanja dari supplier, masukkan lewat menu <b>Tambah Stok Baru / Distribusi</b>.
              </p>
            </div>

            <div className="rounded-xl border bg-muted/30 p-3.5 space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-amber-800">
                <Truck className="h-4 w-4" /> 2. Mobil / Tangan Sales
              </div>
              <p className="text-muted-foreground">
                Barang yang sudah ada di motor/mobil sales bisa dihitung sisa fisiknya di pagi hari pertama dan dimasukkan via <b>Stok Awal</b> lokasi Sales.
              </p>
              <p className="text-muted-foreground">
                Selanjutnya, perpindahan barang dari Gudang ke Sales dilakukan resmi lewat menu <b>Muat Pagi (Gudang → Sales)</b>.
              </p>
            </div>

            <div className="rounded-xl border bg-muted/30 p-3.5 space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-emerald-800">
                <Store className="h-4 w-4" /> 3. Stok di Toko / Warung (Sambil Jalan)
              </div>
              <p className="text-muted-foreground">
                Anda <b>tidak perlu</b> mendatangi dan menghitung ratusan warung dalam satu hari sebelum sistem dipakai.
              </p>
              <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
                <li><b>Kunjungan pertama:</b> Saat sales tiba di warung, hitung sisa barang lama di rak warung dan catat sebagai <i>Stok Awal Warung</i> saat membuka transaksi.</li>
                <li><b>Kunjungan berikutnya:</b> Sistem otomatis mengingat sisa stok sebelumnya. Tidak perlu input awal lagi.</li>
              </ul>
            </div>

            <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3.5 space-y-2">
              <div className="font-bold text-blue-900 flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-blue-600" /> Ringkasan Fungsi Menu
              </div>
              <div className="grid grid-cols-1 gap-1.5 text-[11px]">
                <div className="rounded-lg bg-background p-2 border">
                  <b>Stok Awal (Opname):</b> Menetapkan total fisik riil di lokasi tersebut (koreksi total).
                </div>
                <div className="rounded-lg bg-background p-2 border">
                  <b>Stok Distribusi / Baru:</b> Menambah stok Gudang dari hasil produksi/supplier.
                </div>
                <div className="rounded-lg bg-background p-2 border">
                  <b>Muat Pagi:</b> Memindahkan stok dari Gudang Utama ke mobil/motor Sales.
                </div>
                <div className="rounded-lg bg-background p-2 border">
                  <b>Kunjungan Toko:</b> Mengurangi stok Sales untuk dititip/dijual ke Warung.
                </div>
                <div className="rounded-lg bg-background p-2 border">
                  <b>Setor Sore:</b> Mengembalikan sisa muatan Sales kembali ke Gudang Utama.
                </div>
              </div>
            </div>

            <Button type="button" className="w-full h-10 rounded-xl" onClick={() => setShowGuide(false)}>
              Saya Mengerti
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
