import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { ArrowLeft, Warehouse, Package, Save, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { useProducts } from "@/lib/products";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { packSize } from "@/lib/units";

export const Route = createFileRoute("/_authenticated/stock-opening")({
  head: () => ({ meta: [{ title: "Stok Awal Gudang — Sales Pouch" }] }),
  component: OpeningStockPage,
});

export function OpeningStockPage() {
  const { data: account, isLoading: accountLoading } = useProfile();
  const { data: products = [], isLoading: productsLoading } = useProducts();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const ownerId = account?.ownerId;

  const [quantities, setQuantities] = useState<Record<string, { pack: string; pcs: string }>>({});
  const [saving, setSaving] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [warehouseId, setWarehouseId] = useState<string | null>(null);

  // 1. Ambil atau Buat Gudang Utama secara otomatis
  const { data: warehouse, isLoading: warehouseLoading } = useQuery({
    queryKey: ["default-warehouse", ownerId],
    enabled: !!ownerId,
    queryFn: async () => {
      // Cek apakah sudah ada gudang
      const { data: existing, error: fetchErr } = await (supabase as any)
        .from("stock_locations")
        .select("id, name")
        .eq("owner_id", ownerId)
        .eq("location_type", "warehouse")
        .order("created_at")
        .limit(1)
        .maybeSingle();

      if (fetchErr) throw fetchErr;
      if (existing) return existing;

      // Jika belum ada, otomatis buatkan Gudang Utama
      const { data: created, error: insertErr } = await (supabase as any)
        .from("stock_locations")
        .insert({
          owner_id: ownerId,
          location_type: "warehouse",
          name: "Gudang Utama",
          is_active: true,
        })
        .select("id, name")
        .single();

      if (insertErr) throw insertErr;
      return created;
    },
  });

  useEffect(() => {
    if (warehouse?.id) {
      setWarehouseId(warehouse.id);
      setIsReady(true);
    }
  }, [warehouse]);

  const handleQtyChange = (productId: string, field: "pack" | "pcs", val: string) => {
    setQuantities((prev) => ({
      ...prev,
      [productId]: {
        ...(prev[productId] || { pack: "", pcs: "" }),
        [field]: val,
      },
    }));
  };

  const handleSaveAll = async () => {
    if (!ownerId || !warehouseId) {
      toast.error("Gudang belum siap.");
      return;
    }

    setSaving(true);
    try {
      let savedCount = 0;

      for (const p of products) {
        const item = quantities[p.id];
        const packVal = Math.max(0, parseInt(item?.pack || "0", 10) || 0);
        const pcsVal = Math.max(0, parseInt(item?.pcs || "0", 10) || 0);
        const size = packSize(p.pcs_per_pack);
        const totalPcs = packVal * size + pcsVal;

        if (totalPcs > 0) {
          // Simpan snapshot fisik langsung ke fungsi snapshot database
          const { error } = await (supabase as any).rpc("record_physical_opening_snapshot", {
            _location_id: warehouseId,
            _product_id: p.id,
            _physical_quantity: totalPcs,
            _counted_at: new Date().toISOString(),
            _note: "Input Stok Awal Gudang",
          });

          if (error) throw error;
          savedCount++;
        }
      }

      // Pastikan status setup ditandai selesai/aktif
      await (supabase as any).from("stock_setups").upsert(
        {
          owner_id: ownerId,
          mode: "from_start",
          status: "finalized",
        },
        { onConflict: "owner_id" }
      );

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["master-stock-warehouse"] }),
        queryClient.invalidateQueries({ queryKey: ["master-stock-movements"] }),
        queryClient.invalidateQueries({ queryKey: ["master-stock-setup"] }),
      ]);

      toast.success(`${savedCount} produk berhasil dicatat ke Stok Gudang!`);
      navigate({ to: "/master-stock" });
    } catch (err: any) {
      toast.error(`Gagal menyimpan stok: ${err.message || "Periksa koneksi database"}`);
    } finally {
      setSaving(false);
    }
  };

  if (accountLoading || warehouseLoading || productsLoading) {
    return <main className="mx-auto max-w-md p-10 text-center text-sm text-muted-foreground">Menyiapkan Gudang…</main>;
  }

  if (account?.role !== "owner") {
    return (
      <main className="mx-auto max-w-md p-10 text-center text-destructive">
        Hanya Owner yang dapat mengisi Stok Awal.
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-12 pt-4">
      <Link to="/master-stock" className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Kembali ke Stok Gudang
      </Link>

      <div className="mt-3 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Input Stok Awal Gudang</h1>
          <p className="text-xs text-muted-foreground">Masukkan jumlah fisik barang yang ada di Gudang saat ini.</p>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Warehouse className="h-5 w-5" />
        </div>
      </div>

      <div className="mt-3 rounded-xl border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
        💡 <b>Tips:</b> Masukkan stok dalam hitungan <b>Pack</b> dan <b>Pcs</b> sisa. Jika produk belum ada stok, biarkan kosong (0).
      </div>

      {!products.length ? (
        <div className="mt-6 rounded-2xl border bg-card p-6 text-center text-sm">
          <Package className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
          <p className="font-semibold">Belum Ada Master Produk</p>
          <p className="mt-1 text-xs text-muted-foreground">Tambahkan produk terlebih dahulu di menu Master Produk.</p>
          <Button asChild className="mt-4 h-10 rounded-xl text-xs">
            <Link to="/products">Ke Master Produk</Link>
          </Button>
        </div>
      ) : (
        <div className="mt-4 space-y-2.5">
          {products.map((p) => {
            const size = packSize(p.pcs_per_pack);
            const item = quantities[p.id] || { pack: "", pcs: "" };
            const packNum = parseInt(item.pack || "0", 10) || 0;
            const pcsNum = parseInt(item.pcs || "0", 10) || 0;
            const totalPcs = packNum * size + pcsNum;

            return (
              <div key={p.id} className="rounded-xl border bg-card p-3 shadow-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">{p.name}</div>
                    <div className="text-[10px] text-muted-foreground">1 pack = {size} pcs</div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs font-bold text-primary">{totalPcs.toLocaleString("id-ID")}</span>
                    <span className="text-[10px] text-muted-foreground ml-1">pcs</span>
                  </div>
                </div>

                <div className="mt-2.5 grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-medium text-muted-foreground">Jumlah Pack</label>
                    <Input
                      type="number"
                      min={0}
                      placeholder="0"
                      value={item.pack}
                      onChange={(e) => handleQtyChange(p.id, "pack", e.target.value)}
                      className="h-9 text-sm rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-muted-foreground">Sisa Pcs</label>
                    <Input
                      type="number"
                      min={0}
                      max={size - 1}
                      placeholder="0"
                      value={item.pcs}
                      onChange={(e) => handleQtyChange(p.id, "pcs", e.target.value)}
                      className="h-9 text-sm rounded-lg"
                    />
                  </div>
                </div>
              </div>
            );
          })}

          <div className="pt-3">
            <Button
              onClick={handleSaveAll}
              disabled={saving || !isReady}
              className="h-11 w-full rounded-xl text-sm font-semibold shadow-xs"
            >
              <Save className="mr-2 h-4 w-4" />
              {saving ? "Menyimpan Stok Fisik…" : "Simpan Stok Gudang"}
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}
