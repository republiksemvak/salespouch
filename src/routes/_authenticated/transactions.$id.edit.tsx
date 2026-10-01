import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useProducts, type Product } from "@/lib/products";
import { formatQty, packSize, proportionalPrice, toPieces } from "@/lib/units";
import { rp, type LineItem, type NewItem } from "@/lib/visit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Json } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/transactions/$id/edit")({
  head: () => ({ meta: [{ title: "Revisi Transaksi — Sales Pouch" }, { name: "description", content: "Revisi transaksi dengan penyesuaian stok dan utang otomatis." }, { property: "og:title", content: "Revisi Transaksi — Sales Pouch" }, { property: "og:description", content: "Revisi transaksi dengan penyesuaian stok dan utang otomatis." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: EditTransactionPage,
});

const whole = (value: string) => /^\d+$/.test(value) ? Number(value) : 0;
const money = (value: string) => /^\d+$/.test(value) ? Number(value) : 0;
type EditItem = { name: string; price: number; pcs_per_pack: number; prev_stock: number; qtyPack: string; qtyPcs: string };

function EditTransactionPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: products = [] } = useProducts();
  const [items, setItems] = useState<EditItem[] | null>(null);
  const [newItems, setNewItems] = useState<EditItem[] | null>(null);
  const [discount, setDiscount] = useState("");
  const [paid, setPaid] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: tx, isLoading, error } = useQuery({
    queryKey: ["transaction-edit", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("transactions").select("*,outlets(name)").eq("id", id).single();
      if (error) throw error;
      const lines = ((data.line_items as LineItem[]) ?? []).map((i) => ({ name: i.name, price: Number(i.price), pcs_per_pack: packSize(i.pcs_per_pack), prev_stock: Number(i.prev_stock), qtyPack: String(Math.floor((data.transaction_type === "Direct Sale" ? Number(i.sold) : Number(i.returned)) / packSize(i.pcs_per_pack)) || ""), qtyPcs: String((data.transaction_type === "Direct Sale" ? Number(i.sold) : Number(i.returned)) % packSize(i.pcs_per_pack) || "") }));
      const fresh = ((data.new_consignment_items as NewItem[]) ?? []).map((i) => ({ name: i.name, price: Number(i.price), pcs_per_pack: packSize(i.pcs_per_pack), prev_stock: 0, qtyPack: String(Math.floor(Number(i.qty) / packSize(i.pcs_per_pack)) || ""), qtyPcs: String(Number(i.qty) % packSize(i.pcs_per_pack) || "") }));
      setItems(lines); setNewItems(fresh); setDiscount(Number(data.discount_amount) ? String(data.discount_amount) : ""); setPaid(Number(data.amount_paid) ? String(data.amount_paid) : ""); setNote(data.custom_note ?? "");
      return data;
    },
  });

  const lineItems = useMemo<LineItem[]>(() => (items ?? []).map((i) => {
    const qty = toPieces(whole(i.qtyPack), whole(i.qtyPcs), i.pcs_per_pack);
    const sold = tx?.transaction_type === "Direct Sale" ? qty : Math.max(0, i.prev_stock - qty);
    return { name: i.name, price: i.price, pcs_per_pack: i.pcs_per_pack, prev_stock: i.prev_stock, sold, returned: tx?.transaction_type === "Direct Sale" ? 0 : qty, remaining: 0, subtotal: proportionalPrice(sold, i.price, i.pcs_per_pack) };
  }), [items, tx?.transaction_type]);
  const totalSales = lineItems.reduce((sum, item) => sum + item.subtotal, 0);

  async function save() {
    if (!tx || !items || !newItems) return;
    if ((items.some((i) => i.qtyPack === "" && i.qtyPcs === "")) || newItems.some((i) => i.qtyPack === "" && i.qtyPcs === "")) { toast.error("Isi jumlah untuk semua produk"); return; }
    if (items.some((i) => whole(i.qtyPcs) >= i.pcs_per_pack || (tx.transaction_type === "Consignment" && toPieces(whole(i.qtyPack), whole(i.qtyPcs), i.pcs_per_pack) > i.prev_stock)) || newItems.some((i) => whole(i.qtyPcs) >= i.pcs_per_pack)) { toast.error("Jumlah pack atau pcs tidak valid"); return; }
    if (!/^\d*$/.test(discount) || !/^\d*$/.test(paid) || money(discount) > totalSales || note.length > 500) { toast.error("Periksa diskon, pembayaran, dan catatan"); return; }
    const cleanNew: NewItem[] = tx.transaction_type === "Consignment" ? newItems.map((i) => ({ name: i.name, price: i.price, pcs_per_pack: i.pcs_per_pack, qty: toPieces(whole(i.qtyPack), whole(i.qtyPcs), i.pcs_per_pack) })).filter((i) => i.qty > 0) : [];
    setBusy(true);
    const { error } = await supabase.rpc("revise_transaction", { _transaction_id: id, _line_items: lineItems as unknown as Json, _new_consignment_items: cleanNew as unknown as Json, _discount_amount: money(discount), _amount_paid: money(paid), _custom_note: note.trim() });
    setBusy(false);
    if (error) { toast.error(error.message.includes("insufficient") ? "Stok gudang tidak cukup untuk revisi ini" : error.message); return; }
    await Promise.all([qc.invalidateQueries({ queryKey: ["products"] }), qc.invalidateQueries({ queryKey: ["stock-summary"] }), qc.invalidateQueries({ queryKey: ["transaction-history"] }), qc.invalidateQueries({ queryKey: ["receipt", id] }), qc.invalidateQueries({ queryKey: ["receipt-prev"] }), qc.invalidateQueries({ queryKey: ["last-visit", tx.outlet_id] })]);
    toast.success("Transaksi dan nota berhasil direvisi");
    navigate({ to: "/receipt/$id", params: { id } });
  }

  if (isLoading || !items || !newItems) return <p className="p-10 text-center text-muted-foreground">Memuat transaksi…</p>;
  if (error || !tx) return <p className="p-10 text-center text-destructive">Transaksi tidak ditemukan.</p>;
  const outlet = (tx.outlets as { name: string } | null)?.name ?? "-";
  const debtPreview = Math.max(0, Number(tx.previous_debt) + totalSales - money(discount) - money(paid));

  return (
    <main className="mx-auto min-h-screen max-w-md px-5 pb-10 pt-6">
      <Link to="/receipt/$id" params={{ id }} className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" />Batal</Link>
      <h1 className="mt-4 text-2xl font-bold">Revisi Transaksi</h1>
      <p className="mt-1 text-sm text-muted-foreground">{tx.receipt_number} · {outlet} · {tx.transaction_type === "Direct Sale" ? "Jual Langsung" : "Konsinyasi"}</p>
      <p className="mt-4 rounded-md bg-secondary p-3 text-sm">Stok lama akan dipulihkan sebelum revisi diterapkan. Utang nota setelah transaksi ini ikut dihitung ulang.</p>

      <EditItems title={tx.transaction_type === "Direct Sale" ? "Produk Terjual" : "Titipan Sebelumnya"} mode={tx.transaction_type === "Direct Sale" ? "sold" : "return"} items={items} setItems={setItems} products={products} allowAdd={tx.transaction_type === "Direct Sale"} />
      {tx.transaction_type === "Consignment" && <EditItems title="Titip Baru Hari Ini" mode="new" items={newItems} setItems={setNewItems} products={products} allowAdd />}

      <section className="mt-6 space-y-3 rounded-md border bg-card p-4">
        <Line label="Total penjualan" value={rp(totalSales)} />
        {tx.transaction_type === "Consignment" && <Line label="Utang sebelumnya" value={rp(Number(tx.previous_debt))} />}
        <label className="block"><Label>Diskon nota (Rp)</Label><Input type="number" min={0} value={discount} placeholder="0" onChange={(e) => setDiscount(e.target.value)} className="mt-1 h-11" /></label>
        <label className="block"><Label>Jumlah dibayar</Label><Input type="number" min={0} value={paid} placeholder="0" onChange={(e) => setPaid(e.target.value)} className="mt-1 h-11" /></label>
        <Line label="Sisa utang setelah revisi" value={rp(debtPreview)} />
      </section>
      <label className="mt-5 block"><Label>Catatan (opsional)</Label><Textarea value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} className="mt-1" /></label>
      <Button onClick={save} disabled={busy} className="mt-6 h-14 w-full">{busy ? "Menyimpan revisi…" : "Simpan Revisi Nota"}</Button>
    </main>
  );
}

function EditItems({ title, mode, items, setItems, products, allowAdd }: { title: string; mode: "sold" | "return" | "new"; items: EditItem[]; setItems: (value: EditItem[]) => void; products: Product[]; allowAdd: boolean }) {
  const available = products.filter((p) => !items.some((i) => i.name.toLowerCase() === p.name.toLowerCase()));
  return <section className="mt-6"><h2 className="font-mono text-xs uppercase text-muted-foreground">{title}</h2><div className="mt-3 space-y-3">
    {items.map((item, index) => { const qty = toPieces(whole(item.qtyPack), whole(item.qtyPcs), item.pcs_per_pack); const sold = mode === "return" ? Math.max(0, item.prev_stock - qty) : qty; const patch = (next: Partial<EditItem>) => setItems(items.map((x, i) => i === index ? { ...x, ...next } : x)); return <div key={`${item.name}-${index}`} className="rounded-md border bg-card p-4">
      <div className="flex items-start justify-between"><div><b>{item.name}</b>{mode === "return" && <div className="text-xs text-muted-foreground">Titip sebelumnya {formatQty(item.prev_stock, item.pcs_per_pack)}</div>}</div>{allowAdd && <Button size="icon" variant="ghost" onClick={() => setItems(items.filter((_, i) => i !== index))} aria-label="Hapus produk"><Trash2 className="h-4 w-4" /></Button>}</div>
      <label className="mt-3 block text-xs text-muted-foreground">Harga per pack<Input type="number" min={0} value={item.price || ""} onChange={(e) => patch({ price: money(e.target.value) })} className="mt-1 h-10" /></label>
      <div className="mt-2 grid grid-cols-2 gap-2"><label className="text-xs text-muted-foreground">{mode === "return" ? "Sisa/retur" : mode === "sold" ? "Terjual" : "Titip"} (pack)<Input type="number" min={0} value={item.qtyPack} placeholder="0" onChange={(e) => setItems(items.map((x, i) => i === index ? { ...x, qtyPack: e.target.value } : x))} className="mt-1 h-10" /></label><label className="text-xs text-muted-foreground">Sisa pcs<Input type="number" min={0} max={item.pcs_per_pack - 1} value={item.qtyPcs} placeholder="0" onChange={(e) => patch({ qtyPcs: e.target.value })} className="mt-1 h-10" /></label></div>
      <div className="mt-2 text-xs text-muted-foreground">{mode === "return" ? `Terjual ${formatQty(sold, item.pcs_per_pack)} · ` : ""}{rp(proportionalPrice(sold, item.price, item.pcs_per_pack))}</div>
    </div>; })}
    {allowAdd && available.length > 0 && <select aria-label={`Tambah ${title}`} value="" onChange={(e) => { const p = products.find((x) => x.id === e.target.value); if (p) setItems([...items, { name: p.name, price: p.price, pcs_per_pack: packSize(p.pcs_per_pack), prev_stock: 0, qtyPack: "", qtyPcs: "" }]); }} className="h-11 w-full rounded-md border bg-background px-3 text-sm"><option value="">+ Tambah produk</option>{available.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
  </div></section>;
}

function Line({ label, value }: { label: string; value: string }) { return <div className="flex justify-between text-sm"><span>{label}</span><b>{value}</b></div>; }