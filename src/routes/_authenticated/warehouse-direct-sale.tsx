import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Trash2, Warehouse } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useProducts, tierPrice, type Product, type PriceTier } from "@/lib/products";
import { useProfile } from "@/hooks/use-profile";
import { nextReceiptNumber } from "@/lib/visit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/warehouse-direct-sale")({
  head: () => ({ meta: [{ title: "Direct Selling Gudang — Sales Pouch" }] }),
  component: WarehouseDirectSalePage,
});

type Row = { productId: string; name: string; qty: string; price: number; pcsPerPack: number };

type ReturnRow = { productId: string; name: string; qty: string; pcsPerPack: number };

function WarehouseDirectSalePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: account } = useProfile();
  const { data: products = [] } = useProducts();
  const [buyerName, setBuyerName] = useState("");
  const [buyerOutletId, setBuyerOutletId] = useState("");
  const [tier, setTier] = useState<PriceTier>("eceran");
  const [rows, setRows] = useState<Row[]>([]);
  const [returns, setReturns] = useState<ReturnRow[]>([]);
  const [discount, setDiscount] = useState("");
  const [paid, setPaid] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: outlets = [] } = useQuery({
    queryKey: ["warehouse-direct-sale-outlets"],
    queryFn: async () => {
      const { data, error } = await supabase.from("outlets").select("id,name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const totalSales = useMemo(
    () => rows.reduce((sum, row) => sum + Number(row.qty || 0) * row.price / Math.max(1, row.pcsPerPack), 0),
    [rows]
  );

  const addSaleRow = () => {
    const product = products.find((p) => !rows.some((r) => r.productId === p.id));
    if (!product) return toast.error("Semua produk sudah ditambahkan");
    setRows((current) => [...current, {
      productId: product.id,
      name: product.name,
      qty: "1",
      price: tierPrice(product, tier),
      pcsPerPack: product.pcs_per_pack,
    }]);
  };

  const addReturnRow = () => {
    const product = products.find((p) => !returns.some((r) => r.productId === p.id));
    if (!product) return toast.error("Semua produk sudah ditambahkan ke retur");
    setReturns((current) => [...current, { productId: product.id, name: product.name, qty: "1", pcsPerPack: product.pcs_per_pack }]);
  };

  const save = async () => {
    if (!account) return;
    if (!buyerName.trim()) return toast.error("Nama pembeli wajib diisi");
    if (!rows.some((r) => Number(r.qty) > 0)) return toast.error("Tambahkan produk yang dijual");
    if (returns.some((r) => Number(r.qty) > 0) && !buyerOutletId) return toast.error("Pilih outlet pembeli untuk mencatat retur");

    const cleanRows = rows.filter((r) => Number(r.qty) > 0).map((r) => ({
      product_id: r.productId,
      name: r.name,
      qty: Number(r.qty),
      price: r.price,
      pcs_per_pack: r.pcsPerPack,
      subtotal: Number(r.qty) * r.price / Math.max(1, r.pcsPerPack),
    }));
    const cleanReturns = returns.filter((r) => Number(r.qty) > 0).map((r) => ({ product_id: r.productId, name: r.name, qty: Number(r.qty), pcs_per_pack: r.pcsPerPack }));
    const discountAmount = Math.max(0, Number(discount) || 0);
    const amountPaid = Math.max(0, Number(paid) || 0);

    setBusy(true);
    try {
      const receipt_number = await nextReceiptNumber();
      const { error } = await supabase.from("warehouse_direct_sales").insert({
        owner_id: account.ownerId,
        receipt_number,
        buyer_name: buyerName.trim(),
        buyer_outlet_id: buyerOutletId || null,
        line_items: cleanRows,
        return_items: cleanReturns,
        total_sales: totalSales,
        discount_amount: discountAmount,
        amount_paid: amountPaid,
        custom_note: note.trim() || null,
      } as any);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["master-stock-global"] });
      toast.success("Penjualan gudang tersimpan");
      navigate({ to: "/dashboard" });
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto min-h-screen max-w-md px-5 pb-8 pt-5">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon"><Link to="/dashboard"><ArrowLeft className="h-5 w-5" /></Link></Button>
        <div><div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Gudang</div><h1 className="text-2xl font-bold">Direct Selling Gudang</h1></div>
      </div>

      <section className="mt-4 rounded-xl border bg-card p-4">
        <div className="flex items-center gap-2"><Warehouse className="h-5 w-5 text-blue-700" /><div><div className="font-semibold">Barang keluar dari Gudang Utama</div><div className="text-xs text-muted-foreground">Tidak memakai stok Sales dan tidak membuat kunjungan outlet.</div></div></div>
      </section>

      <section className="mt-4 space-y-3 rounded-xl border bg-card p-4">
        <div><Label>Pembeli</Label><Input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} placeholder="Nama pembeli / toko" className="mt-1" /></div>
        <div><Label>Outlet pembeli (untuk retur)</Label><select value={buyerOutletId} onChange={(e) => setBuyerOutletId(e.target.value)} className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="">Tidak ada / belum ditentukan</option>{outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>
        <div><Label>Harga</Label><div className="mt-1 grid grid-cols-3 gap-2">{(["eceran", "grosir", "agen"] as PriceTier[]).map((t) => <Button key={t} type="button" variant={tier === t ? "default" : "outline"} onClick={() => { setTier(t); setRows((current) => current.map((r) => { const p = products.find((x) => x.id === r.productId); return p ? { ...r, price: tierPrice(p, t) } : r; })); }}>{t[0].toUpperCase() + t.slice(1)}</Button>)}</div></div>
      </section>

      <section className="mt-4 rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between"><h2 className="font-semibold">Barang Dijual</h2><Button type="button" variant="outline" size="sm" onClick={addSaleRow}><Plus className="mr-1 h-4 w-4" />Produk</Button></div>
        <div className="mt-3 space-y-2">{rows.map((row, index) => <div key={row.productId} className="rounded-lg border p-3"><div className="flex items-center justify-between gap-2"><select value={row.productId} onChange={(e) => { const p = products.find((x) => x.id === e.target.value); if (!p) return; setRows((current) => current.map((r, i) => i === index ? { ...r, productId: p.id, name: p.name, price: tierPrice(p, tier), pcsPerPack: p.pcs_per_pack } : r)); }} className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm">{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select><Button type="button" variant="ghost" size="icon" onClick={() => setRows((current) => current.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4" /></Button></div><div className="mt-2 grid grid-cols-2 gap-2"><Input type="number" min="0" value={row.qty} onChange={(e) => setRows((current) => current.map((r, i) => i === index ? { ...r, qty: e.target.value } : r))} placeholder="Qty pcs" /><Input type="number" min="0" value={row.price} onChange={(e) => setRows((current) => current.map((r, i) => i === index ? { ...r, price: Number(e.target.value) || 0 } : r))} placeholder="Harga / pack" /></div></div>)}</div>
      </section>

      <section className="mt-4 rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between"><div><h2 className="font-semibold">Retur ke Gudang</h2><p className="text-xs text-muted-foreground">Outlet pembeli → Gudang Utama.</p></div><Button type="button" variant="outline" size="sm" onClick={addReturnRow}><Plus className="mr-1 h-4 w-4" />Retur</Button></div>
        <div className="mt-3 space-y-2">{returns.map((row, index) => <div key={row.productId} className="flex items-center gap-2"><select value={row.productId} onChange={(e) => { const p = products.find((x) => x.id === e.target.value); if (!p) return; setReturns((current) => current.map((r, i) => i === index ? { ...r, productId: p.id, name: p.name, pcsPerPack: p.pcs_per_pack } : r)); }} className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm">{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select><Input className="w-24" type="number" min="0" value={row.qty} onChange={(e) => setReturns((current) => current.map((r, i) => i === index ? { ...r, qty: e.target.value } : r))} /><Button type="button" variant="ghost" size="icon" onClick={() => setReturns((current) => current.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4" /></Button></div>)}</div>
      </section>

      <section className="mt-4 rounded-xl border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between"><span className="text-muted-foreground">Total</span><b>Rp {Math.round(totalSales).toLocaleString("id-ID")}</b></div>
        <div><Label>Diskon</Label><Input type="number" min="0" value={discount} onChange={(e) => setDiscount(e.target.value)} className="mt-1" /></div>
        <div><Label>Dibayar</Label><Input type="number" min="0" value={paid} onChange={(e) => setPaid(e.target.value)} className="mt-1" /></div>
        <div><Label>Catatan</Label><Input value={note} onChange={(e) => setNote(e.target.value)} className="mt-1" /></div>
      </section>

      <Button className="mt-4 h-12 w-full" disabled={busy} onClick={save}>{busy ? "Menyimpan..." : "Simpan Penjualan Gudang"}</Button>
    </main>
  );
}
