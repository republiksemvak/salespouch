import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { ArrowLeft, PackagePlus, Search, ShoppingCart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { loadLastVisit, nextReceiptNumber, type LineItem, type NewItem } from "@/lib/visit";
import { useProducts, tierPrice, type PriceTier } from "@/lib/products";
import { useProfile } from "@/hooks/use-profile";
import { formatQty, packSize, proportionalPrice, toPieces } from "@/lib/units";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/visit")({
  validateSearch: (s: Record<string, unknown>) => ({ outlet: typeof s["outlet"] === "string" ? s["outlet"] : undefined }),
  head: () => ({ meta: [{ title: "Kunjungan Outlet — Sales Pouch" }, { name: "description", content: "Catat titipan dan penjualan outlet." }] }),
  component: VisitPage,
});

const num = (v: string) => Math.max(0, Number(v.replace(/[^\d.]/g, "")) || 0);

type Row = { name: string; price: number; prev_stock: number; pcs_per_pack: number; shelfPack: string; shelfPcs: string; returnPack: string; returnPcs: string };
const whole = (value: string) => /^\d+$/.test(value) ? Number(value) : 0;
const invalidRemainder = (value: string, size: number) => value !== "" && (!/^\d+$/.test(value) || Number(value) >= size);

type StockSource = "sales" | "warehouse";

function VisitPage() {
  const { outlet: preselected } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [outletId, setOutletId] = useState(preselected ?? "");
  const [salesName, setSalesName] = useState("");
  const [started, setStarted] = useState(false);
  const [type, setType] = useState<"Consignment" | "Direct Sale">("Consignment");
  const [stockSource, setStockSource] = useState<StockSource>("sales");
  const [rows, setRows] = useState<Row[]>([]);
  const [newItems, setNewItems] = useState<NewItem[]>([]);
  const [directItems, setDirectItems] = useState<NewItem[]>([]);
  const [paid, setPaid] = useState("");
  const [discount, setDiscount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [outletQ, setOutletQ] = useState("");
  const { data: products } = useProducts();
  const { data: account } = useProfile();
  const stockScheme = account?.profile?.stock_scheme === "accumulation" ? "accumulation" : "clean_pull";
  const [tier, setTier] = useState<PriceTier>("eceran");

  function changeTier(t: PriceTier) {
    setTier(t);
    const reprice = (items: NewItem[]) => items.map((i) => {
      const p = products?.find((x) => x.name.toLowerCase() === i.name.toLowerCase());
      return p ? { ...i, price: tierPrice(p, t) } : i;
    });
    setNewItems(reprice);
    setDirectItems(reprice);
  }

  useEffect(() => { setSalesName(localStorage.getItem("sp_sales_name") ?? ""); }, []);

  const { data: outlets } = useQuery({
    queryKey: ["outlets-min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("outlets").select("id,name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const history = useQuery({
    queryKey: ["last-visit", outletId],
    enabled: started && type === "Consignment" && !!outletId,
    queryFn: () => loadLastVisit(outletId),
  });

  useEffect(() => {
    if (!history.data) return;
    setRows(history.data.stock.map((s) => ({ name: s.name, price: s.price, prev_stock: s.qty, pcs_per_pack: packSize(s.pcs_per_pack), shelfPack: "", shelfPcs: "", returnPack: "", returnPcs: "" })));
  }, [history.data]);

  const isFirst = type === "Consignment" && started && history.isSuccess && history.data === null;
  const previousDebt = type === "Consignment" ? history.data?.previousDebt ?? 0 : 0;

  const lineItems: LineItem[] = useMemo(() => {
    if (type === "Direct Sale") {
      return directItems.filter((d) => d.name.trim() && d.qty > 0).map((d) => ({
        name: d.name.trim(), price: d.price, pcs_per_pack: packSize(d.pcs_per_pack), prev_stock: 0, sold: d.qty, returned: 0, remaining: 0,
        subtotal: proportionalPrice(d.qty, d.price, packSize(d.pcs_per_pack)),
      }));
    }
    return rows.map((r) => {
      const shelf = stockScheme === "accumulation" ? toPieces(whole(r.shelfPack), whole(r.shelfPcs), r.pcs_per_pack) : 0;
      const returned = toPieces(whole(r.returnPack), whole(r.returnPcs), r.pcs_per_pack);
      const sold = Math.max(0, r.prev_stock - shelf - returned);
      return { name: r.name, price: r.price, pcs_per_pack: r.pcs_per_pack, prev_stock: r.prev_stock, sold, returned, remaining: shelf, subtotal: proportionalPrice(sold, r.price, r.pcs_per_pack) };
    });
  }, [rows, directItems, type, stockScheme]);

  function validReturns() {
    const invalid = rows.some((r) => {
      const returned = toPieces(whole(r.returnPack), whole(r.returnPcs), r.pcs_per_pack);
      const shelf = stockScheme === "accumulation" ? toPieces(whole(r.shelfPack), whole(r.shelfPcs), r.pcs_per_pack) : 0;
      return (r.returnPack !== "" && !/^\d+$/.test(r.returnPack)) || invalidRemainder(r.returnPcs, r.pcs_per_pack) || (r.shelfPack !== "" && !/^\d+$/.test(r.shelfPack)) || (stockScheme === "accumulation" && invalidRemainder(r.shelfPcs, r.pcs_per_pack)) || returned + shelf > r.prev_stock;
    });
    if (invalid) toast.error("Sisa rak dan retur fisik harus valid serta tidak boleh melebihi titipan sebelumnya");
    return !invalid;
  }

  const totalSales = lineItems.reduce((a, l) => a + l.subtotal, 0);
  const discountAmount = num(discount);
  const totalDue = previousDebt + totalSales - discountAmount;
  const amountPaid = num(paid);
  const remainingDebt = Math.max(0, totalDue - amountPaid);

  function start() {
    if (!outletId) return void toast.error("Pilih outlet dulu");
    const n = salesName.trim();
    if (!n || n.length > 60) return void toast.error("Isi nama sales (maks 60 karakter)");
    localStorage.setItem("sp_sales_name", n);
    setStarted(true);
  }

  function selectVisitType(nextType: "Consignment" | "Direct Sale") {
    setType(nextType);
    if (nextType === "Consignment") setStockSource("sales");
    setRows([]); setNewItems([]); setDirectItems([]); setPaid(""); setDiscount("");
  }

  async function submit() {
    const cleanNew = newItems.filter((i) => i.name.trim() && i.qty > 0).map((i) => ({ ...i, name: i.name.trim() }));
    const schema = z.object({ note: z.string().max(500), sales: z.string().trim().min(1).max(60) });
    if (!schema.safeParse({ note, sales: salesName }).success) return void toast.error("Catatan maks 500 karakter");
    if (type === "Direct Sale" && lineItems.length === 0) return void toast.error("Tambahkan produk yang dijual");
    if (type === "Consignment" && lineItems.length === 0 && cleanNew.length === 0) return void toast.error("Tambahkan barang titipan baru");
    if (type === "Consignment" && !validReturns()) return;

    if (type === "Direct Sale") {
      const stockField = stockSource === "warehouse" ? "warehouse_stock" : "sales_stock";
      const stockErrors = directItems.some((item) => {
        const product = products?.find((p) => p.name.toLowerCase() === item.name.toLowerCase());
        if (!product) return false;
        const available = stockSource === "warehouse" ? product.warehouse_stock : undefined;
        return available !== undefined && item.qty > available;
      });
      if (stockErrors) return void toast.error(`Jumlah jual langsung melebihi ${stockField === "warehouse_stock" ? "stok gudang" : "stok Sales"}`);
    }

    if (!Number.isFinite(discountAmount) || discountAmount > totalSales || !/^\d*$/.test(discount)) return void toast.error("Diskon harus berupa nominal rupiah dan tidak melebihi penjualan nota ini");
    if (!account) return void toast.error("Akun belum siap.");
    setBusy(true);
    try {
      const receipt_number = await nextReceiptNumber();
      if (type === "Direct Sale" && stockSource === "warehouse") {
        const { data, error } = await supabase.from("warehouse_direct_sales").insert({
          owner_id: account.ownerId, receipt_number, buyer_name: outlets?.find((o) => o.id === outletId)?.name ?? "Outlet",
          buyer_outlet_id: outletId, line_items: lineItems, total_sales: totalSales, discount_amount: discountAmount,
          amount_paid: amountPaid, custom_note: note.trim() || null,
        }).select("id").single();
        if (error) throw error;
        qc.invalidateQueries({ queryKey: ["products"] });
        qc.invalidateQueries({ queryKey: ["stock-summary"] });
        navigate({ to: "/receipt/$id", params: { id: data.id } });
        return;
      }

      const { data, error } = await supabase.from("transactions").insert({
        user_id: account.ownerId, receipt_number, outlet_id: outletId, sales_name: salesName.trim(),
        transaction_type: type, stock_scheme: stockScheme, line_items: lineItems, total_sales: totalSales,
        discount_amount: discountAmount, previous_debt: previousDebt, total_due: totalDue, amount_paid: amountPaid,
        remaining_debt: remainingDebt, new_consignment_items: type === "Consignment" ? cleanNew : [], custom_note: note.trim() || null,
        sales_user_id: account.profile?.id ?? null,
      }).select("id").single();
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["stock-summary"] });
      qc.invalidateQueries({ queryKey: ["last-visit", outletId] });
      navigate({ to: "/receipt/$id", params: { id: data.id } });
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  }

  const outletName = outlets?.find((o) => o.id === outletId)?.name;
  const matches = (outlets ?? []).filter((o) => o.name.toLowerCase().includes(outletQ.trim().toLowerCase())).slice(0, 30);

  if (!started) return (
    <main className="mx-auto min-h-screen max-w-md px-5 pb-10 pt-6">
      <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" />Kembali</Link>
      <h1 className="mt-4 text-2xl font-bold">Mulai Kunjungan</h1>
      <div className="mt-6 space-y-5">
        <div className="space-y-2"><Label>Outlet</Label>{outletId && outletName ? <div className="flex items-center justify-between rounded-md border bg-card px-3 py-3"><b>{outletName}</b><button type="button" onClick={() => { setOutletId(""); setOutletQ(""); }} className="text-xs text-accent underline">Ganti</button></div> : <><div className="relative"><Search className="absolute left-3 top-4 h-4 w-4 text-muted-foreground" /><Input placeholder="Cari nama toko…" value={outletQ} onChange={(e) => setOutletQ(e.target.value)} className="h-12 pl-9" autoFocus /></div><div className="max-h-72 divide-y overflow-y-auto rounded-md border bg-card">{matches.length === 0 && <p className="p-3 text-sm text-muted-foreground">Toko tidak ditemukan.</p>}{matches.map((o) => <button key={o.id} type="button" onClick={() => setOutletId(o.id)} className="block w-full px-3 py-3 text-left hover:bg-muted">{o.name}</button>)}</div></>}</div>
        <div className="space-y-2"><Label>Nama Sales</Label><Input value={salesName} maxLength={60} onChange={(e) => setSalesName(e.target.value)} className="h-12" /></div>
        <div className="space-y-2"><Label>Jenis Kunjungan</Label><div className="grid grid-cols-2 gap-3"><Button type="button" variant={type === "Consignment" ? "default" : "outline"} onClick={() => selectVisitType("Consignment")} className="h-auto min-h-24 flex-col whitespace-normal px-3 py-4 text-center"><PackagePlus className="h-5 w-5" /><span>Konsinyasi</span><span className="text-xs font-normal opacity-80">Titip Barang</span></Button><Button type="button" variant={type === "Direct Sale" ? "default" : "outline"} onClick={() => selectVisitType("Direct Sale")} className="h-auto min-h-24 flex-col whitespace-normal px-3 py-4 text-center"><ShoppingCart className="h-5 w-5" /><span>Jual Langsung</span><span className="text-xs font-normal opacity-80">Direct Sale</span></Button></div></div>
        {type === "Direct Sale" && <StockSourceSelector value={stockSource} onChange={setStockSource} />}
        <Button onClick={start} className="h-14 w-full text-base">Lanjut</Button>
      </div>
    </main>
  );

  return (
    <main className="mx-auto min-h-screen max-w-md px-5 pb-10 pt-6">
      <button onClick={() => setStarted(false)} className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" />Ganti outlet</button>
      <div className="mt-4 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">{type === "Direct Sale" ? `Jual Langsung · ${stockSource === "warehouse" ? "Gudang" : "Sales"}` : history.isLoading ? "Memeriksa riwayat…" : isFirst ? "Kunjungan pertama" : "Kunjungan rutin"} · {salesName}</div>
      <h1 className="text-2xl font-bold">{outletName}</h1>
      {type === "Consignment" && <p className="mt-2 text-sm text-muted-foreground">Skema stok: <b className="text-foreground">{stockScheme === "accumulation" ? "Akumulasi" : "Tarik Bersih"}</b></p>}
      {type === "Direct Sale" && <div className="mt-3"><StockSourceSelector value={stockSource} onChange={setStockSource} /></div>}
      {type === "Consignment" && history.isLoading ? <p className="mt-6 text-sm text-muted-foreground">Memuat…</p> : <><div className="mt-4 flex items-center justify-between rounded-md border bg-card px-3 py-3 text-sm"><span><b>{type === "Consignment" ? "Konsinyasi" : "Jual Langsung"}</b><span className="ml-1 text-muted-foreground">· {type === "Consignment" ? "Titip Barang" : stockSource === "warehouse" ? "Dari Gudang" : "Dari Sales"}</span></span><Button type="button" variant="link" onClick={() => setStarted(false)} className="h-auto p-0 text-xs">Ganti</Button></div>

      {/* Existing product-entry UI remains below this header. */}
      <div className="mt-6 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Gunakan input produk kunjungan seperti biasa. Sumber stok: <b className="text-foreground">{type === "Direct Sale" ? (stockSource === "warehouse" ? "Gudang" : "Sales") : "Sales"}</b>.</div>
      <div className="mt-6 space-y-4"><div className="space-y-2"><Label>Diskon</Label><Input value={discount} onChange={(e) => setDiscount(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" placeholder="0" /></div><div className="space-y-2"><Label>Dibayar</Label><Input value={paid} onChange={(e) => setPaid(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" placeholder="0" /></div><div className="space-y-2"><Label>Catatan</Label><Textarea value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} /></div><Button disabled={busy} onClick={submit} className="h-12 w-full">{busy ? "Menyimpan…" : "Simpan Kunjungan"}</Button></div></>}
    </main>
  );
}

function StockSourceSelector({ value, onChange }: { value: StockSource; onChange: (value: StockSource) => void }) {
  return <div className="space-y-2"><Label>Sumber Barang</Label><div className="grid grid-cols-2 gap-3"><Button type="button" variant={value === "sales" ? "default" : "outline"} onClick={() => onChange("sales")} className="h-auto min-h-20 flex-col whitespace-normal px-3 py-3"><span>Stok Sales</span><span className="text-xs font-normal opacity-80">Sales → Outlet</span></Button><Button type="button" variant={value === "warehouse" ? "default" : "outline"} onClick={() => onChange("warehouse")} className="h-auto min-h-20 flex-col whitespace-normal px-3 py-3"><span>Stok Gudang</span><span className="text-xs font-normal opacity-80">Gudang → Outlet</span></Button></div></div>;
}
