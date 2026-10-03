import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Save, Store } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useProducts } from "@/lib/products";
import { useProfile } from "@/hooks/use-profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/stock-opening")({
  head: () => ({
    meta: [
      { title: "Stok Pembukaan — Sales Pouch" },
      { name: "description", content: "Masukkan stok yang sudah berada di outlet sebelum Sales Pouch mulai digunakan." },
    ],
  }),
  component: OpeningStockPage,
});

function OpeningStockPage() {
  const { data: account, isLoading: accountLoading } = useProfile();
  const { data: products, isLoading: productsLoading } = useProducts();
  const qc = useQueryClient();
  const [outletId, setOutletId] = useState("");
  const [qty, setQty] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const { data: outlets = [], isLoading: outletsLoading } = useQuery({
    queryKey: ["opening-stock-outlets"],
    enabled: account?.role === "owner",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("outlets")
        .select("id,name")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: existing = [], isLoading: existingLoading } = useQuery({
    queryKey: ["opening-stock", outletId],
    enabled: !!outletId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("outlet_opening_stock")
        .select("product_id,quantity")
        .eq("outlet_id", outletId);
      if (error) throw error;
      return (data ?? []) as { product_id: string; quantity: number }[];
    },
  });

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const row of existing) next[row.product_id] = String(Number(row.quantity) || 0);
    setQty(next);
  }, [existing]);

  const selectedOutlet = outlets.find((o) => o.id === outletId);
  const productList = useMemo(() => products ?? [], [products]);
  const filledCount = productList.filter((p) => Number(qty[p.id] || 0) > 0).length;

  async function save() {
    if (!outletId) return void toast.error("Pilih outlet terlebih dahulu.");
    if (!productList.length) return void toast.error("Belum ada produk.");

    setSaving(true);
    try {
      const { error: delError } = await (supabase as any)
        .from("outlet_opening_stock")
        .delete()
        .eq("outlet_id", outletId);
      if (delError) throw delError;

      const rows = productList
        .map((p) => ({
          outlet_id: outletId,
          product_id: p.id,
          quantity: Math.max(0, Number(qty[p.id] || 0)),
        }))
        .filter((row) => row.quantity > 0);

      if (rows.length) {
        const { error } = await (supabase as any)
          .from("outlet_opening_stock")
          .insert(rows);
        if (error) throw error;
      }

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["opening-stock", outletId] }),
        qc.invalidateQueries({ queryKey: ["stock-summary"] }),
        qc.invalidateQueries({ queryKey: ["last-visit", outletId] }),
      ]);
      toast.success(`Stok pembukaan ${selectedOutlet?.name ?? "outlet"} berhasil disimpan.`);
    } catch (error) {
      toast.error(`Gagal menyimpan: ${(error as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  if (accountLoading) return <div className="p-10 text-center">Memuat…</div>;
  if (account?.role !== "owner") return <div className="p-10 text-center text-destructive">Hanya Owner yang dapat mengatur stok pembukaan.</div>;

  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-10 pt-5">
      <Link to="/products" className="inline-flex items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeft className="h-4 w-4" /> Kembali ke Master Produk
      </Link>

      <header className="mt-4">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted"><Store className="h-5 w-5" /></div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Stok Pembukaan</h1>
            <p className="text-xs text-muted-foreground">Masukkan stok yang sudah ada di toko sebelum mulai mencatat transaksi.</p>
          </div>
        </div>
      </header>

      <section className="mt-3 rounded-2xl border bg-card p-4">
        <div className="text-sm font-semibold">Sudah punya stok di toko?</div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Isi jumlah produk yang <b>saat ini sudah ada di toko</b>. Produk dan <b>stok gudang</b> diatur melalui <b>Master Produk</b>.
        </p>
      </section>

      <section className="mt-3 rounded-2xl border bg-card p-4">
        <div className="text-sm font-semibold">1. Pilih Outlet</div>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          Profil toko dibuat melalui <b className="text-foreground">Tambah Outlet</b>.
        </p>
        <select
          value={outletId}
          onChange={(e) => setOutletId(e.target.value)}
          className="mt-3 h-11 w-full rounded-md border bg-background px-3 text-sm"
          disabled={outletsLoading}
        >
          <option value="">Pilih toko…</option>
          {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </section>

      <section className="mt-3 rounded-2xl border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">2. Masukkan Stok Saat Ini</div>
            <p className="mt-1 text-[11px] text-muted-foreground">Produk diambil dari Master Produk. Isi 0 jika tidak ada di toko.</p>
          </div>
          <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-[10px]">{filledCount} terisi</span>
        </div>

        {!outletId && <p className="mt-5 text-center text-sm text-muted-foreground">Pilih outlet untuk mulai mengisi stok.</p>}
        {outletId && (productsLoading || existingLoading) && <p className="mt-5 text-center text-sm text-muted-foreground">Memuat stok…</p>}
        {outletId && !productsLoading && !existingLoading && productList.length === 0 && <p className="mt-5 text-center text-sm text-muted-foreground">Belum ada produk. Tambahkan produk melalui Master Produk.</p>}
        {outletId && !productsLoading && !existingLoading && productList.length > 0 && (
          <div className="mt-4 space-y-2">
            {productList.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-xl border p-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{p.name}</div>
                  <div className="text-[10px] text-muted-foreground">{p.pcs_per_pack} pcs/pack</div>
                </div>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  value={qty[p.id] ?? "0"}
                  onChange={(e) => setQty((prev) => ({ ...prev, [p.id]: e.target.value }))}
                  className="h-10 w-24 text-right"
                  aria-label={`Stok ${p.name}`}
                />
                <span className="w-6 text-[10px] text-muted-foreground">pcs</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {outletId && productList.length > 0 && (
        <div className="sticky bottom-4 mt-4">
          <Button onClick={save} disabled={saving} className="h-13 w-full rounded-xl text-base">
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Menyimpan…" : "Simpan Stok Saat Ini"}
          </Button>
        </div>
      )}

      <p className="mt-4 text-center text-[10px] leading-relaxed text-muted-foreground">
        Stok ini menjadi titik awal pencatatan untuk outlet tersebut.
      </p>
    </main>
  );
}
