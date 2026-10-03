import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { ArrowLeft, PackagePlus, Plus, Search, ShoppingCart, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { loadLastVisit, nextReceiptNumber, rp, type LineItem, type NewItem } from "@/lib/visit";
import { useProducts, tierPrice, TIERS, type Product, type PriceTier } from "@/lib/products";
import { useProfile } from "@/hooks/use-profile";
import { formatQty, packSize, proportionalPrice, toPieces } from "@/lib/units";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/visit")({
  validateSearch: (s: Record<string, unknown>) => ({ outlet: typeof s['outlet'] === "string" ? s['outlet'] : undefined }),
  head: () => ({ meta: [{ title: "Kunjungan Outlet — Sales Pouch" }, { name: "description", content: "Catat titipan pack dan retur pcs saat kunjungan outlet." }, { property: "og:title", content: "Kunjungan Outlet — Sales Pouch" }, { property: "og:description", content: "Catat titipan pack dan retur pcs saat kunjungan outlet." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: VisitPage,
});

const num = (v: string) => Math.max(0, Number(v.replace(/[^\d.]/g, "")) || 0);

type Row = { name: string; price: number; prev_stock: number; pcs_per_pack: number; shelfPack: string; shelfPcs: string; returnPack: string; returnPcs: string };
const whole = (value: string) => /^\d+$/.test(value) ? Number(value) : 0;
const invalidRemainder = (value: string, size: number) => value !== "" && (!/^\d+$/.test(value) || Number(value) >= size);

function VisitPage() {
  const { outlet: preselected } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [outletId, setOutletId] = useState(preselected ?? "");
  const [salesName, setSalesName] = useState("");
  const [started, setStarted] = useState(false);
  const [type, setType] = useState<"Consignment" | "Direct Sale">("Consignment");
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
    setNewItems(reprice); setDirectItems(reprice);
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
    if (type === "Direct Sale")
      return directItems.filter((d) => d.name.trim() && d.qty > 0).map((d) => ({
        name: d.name.trim(), price: d.price, pcs_per_pack: packSize(d.pcs_per_pack), prev_stock: 0, sold: d.qty, returned: 0, remaining: 0, subtotal: proportionalPrice(d.qty, d.price, packSize(d.pcs_per_pack)),
      }));
    return rows.map((r) => {
      const shelf = stockScheme === "accumulation" ? toPieces(whole(r.shelfPack), whole(r.shelfPcs), r.pcs_per_pack) : 0;
      const returned = toPieces(whole(r.returnPack), whole(r.returnPcs), r.pcs_per_pack);
      const entered = r.returnPack !== "" || r.returnPcs !== "" || (stockScheme === "accumulation" && (r.shelfPack !== "" || r.shelfPcs !== ""));
      const sold = entered ? Math.max(0, r.prev_stock - shelf - returned) : 0;
      return { name: r.name, price: r.price, pcs_per_pack: r.pcs_per_pack, prev_stock: r.prev_stock, sold, returned, remaining: shelf, subtotal: proportionalPrice(sold, r.price, r.pcs_per_pack) };
    });
  }, [rows, directItems, type, stockScheme]);

  const [savedInput, setSavedInput] = useState(false);
  useEffect(() => { setSavedInput(false); }, [rows, newItems, directItems, type]);
  function saveInput() {
    if (type === "Consignment" && !validReturns()) return;
    setSavedInput(true);
    toast.success("Input produk tersimpan");
  }

  const totalSales = lineItems.reduce((a, l) => a + l.subtotal, 0);
  const discountAmount = num(discount);
  const totalDue = previousDebt + totalSales - discountAmount;
  const amountPaid = num(paid);
  const remainingDebt = Math.max(0, totalDue - amountPaid);

  function validReturns() {
    if (rows.some((r) => r.returnPack === "" && r.returnPcs === "")) { toast.error("Isi retur fisik untuk semua produk, termasuk 0 bila tidak ada"); return false; }
    if (stockScheme === "accumulation" && rows.some((r) => r.shelfPack === "" && r.shelfPcs === "")) { toast.error("Isi sisa di rak untuk semua produk, termasuk 0 bila habis"); return false; }
    if (rows.some((r) => (r.returnPack !== "" && !/^\d+$/.test(r.returnPack)) || invalidRemainder(r.returnPcs, r.pcs_per_pack) || (r.shelfPack !== "" && !/^\d+$/.test(r.shelfPack)) || invalidRemainder(r.shelfPcs, r.pcs_per_pack) || toPieces(whole(r.returnPack), whole(r.returnPcs), r.pcs_per_pack) + (stockScheme === "accumulation" ? toPieces(whole(r.shelfPack), whole(r.shelfPcs), r.pcs_per_pack) : 0) > r.prev_stock)) {
      toast.error("Sisa rak dan retur fisik harus valid serta tidak melebihi titipan sebelumnya"); return false;
    }
    return true;
  }

  function start() {
    if (!outletId) { toast.error("Pilih outlet dulu"); return; }
    const n = salesName.trim();
    if (!n || n.length > 60) { toast.error("Isi nama sales (maks 60 karakter)"); return; }
    localStorage.setItem("sp_sales_name", n);
    setStarted(true);
  }

  function selectVisitType(nextType: "Consignment" | "Direct Sale") {
    setType(nextType);
    setRows([]);
    setNewItems([]);
    setDirectItems([]);
    setPaid("");
    setDiscount("");
  }

  async function submit() {
    const cleanNew = newItems.filter((i) => i.name.trim() && i.qty > 0).map((i) => ({ ...i, name: i.name.trim() }));
    const schema = z.object({ note: z.string().max(500), sales: z.string().trim().min(1).max(60) });
    const v = schema.safeParse({ note, sales: salesName });
    if (!v.success) { toast.error("Catatan maks 500 karakter"); return; }
    if (type === "Direct Sale" && lineItems.length === 0) { toast.error("Tambahkan produk yang dijual"); return; }
    if (type === "Consignment" && lineItems.length === 0 && cleanNew.length === 0)
      { toast.error("Tambahkan barang titipan baru"); return; }
    if (type === "Consignment" && !validReturns()) return;
    if (type === "Direct Sale" && directItems.some((item) => {
      const product = products?.find((p) => p.name.toLowerCase() === item.name.toLowerCase());
      return product && item.qty > product.warehouse_stock;
    })) { toast.error("Jumlah jual langsung melebihi stok gudang"); return; }
    if (!Number.isFinite(discountAmount) || discountAmount > totalSales || !/^\d*$/.test(discount)) { toast.error("Diskon harus berupa nominal rupiah dan tidak melebihi penjualan nota ini"); return; }
    setBusy(true);
    try {
      const receipt_number = await nextReceiptNumber();
      if (!account) throw new Error("Akun belum siap.");
      const { data, error } = await supabase.from("transactions").insert({
        user_id: account.ownerId, receipt_number, outlet_id: outletId, sales_name: salesName.trim(), transaction_type: type,
         stock_scheme: stockScheme,
         line_items: lineItems, total_sales: totalSales, discount_amount: discountAmount, previous_debt: previousDebt, total_due: totalDue,
        amount_paid: amountPaid, remaining_debt: remainingDebt,
        new_consignment_items: type === "Consignment" ? cleanNew : [],
        custom_note: note.trim() || null,
      }).select("id").single();
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["stock-summary"] });
      qc.invalidateQueries({ queryKey: ["last-visit", outletId] });
      navigate({ to: "/receipt/$id", params: { id: data.id } });
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  const outletName = outlets?.find((o) => o.id === outletId)?.name;
  const matches = (outlets ?? []).filter((o) => o.name.toLowerCase().includes(outletQ.trim().toLowerCase())).slice(0, 30);

  if (!started) {
    return (
      <main className="mx-auto min-h-screen max-w-md px-5 pb-10 pt-6">
        <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" />Kembali</Link>
        <h1 className="mt-4 text-2xl font-bold">Mulai Kunjungan</h1>
        <div className="mt-6 space-y-5">
          <div className="space-y-2">
            <Label>Outlet</Label>
            {outletId && outletName ? (
              <div className="flex items-center justify-between rounded-md border bg-card px-3 py-3">
                <b>{outletName}</b>
                <button type="button" onClick={() => { setOutletId(""); setOutletQ(""); }} className="text-xs text-accent underline">Ganti</button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-4 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Cari nama toko…" value={outletQ} onChange={(e) => setOutletQ(e.target.value)} className="h-12 pl-9" autoFocus />
                </div>
                <div className="max-h-72 divide-y overflow-y-auto rounded-md border bg-card">
                  {matches.length === 0 && <p className="p-3 text-sm text-muted-foreground">Toko tidak ditemukan.</p>}
                  {matches.map((o) => (
                    <button key={o.id} type="button" onClick={() => setOutletId(o.id)} className="block w-full px-3 py-3 text-left hover:bg-muted">{o.name}</button>
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="space-y-2"><Label>Nama Sales</Label><Input value={salesName} maxLength={60} onChange={(e) => setSalesName(e.target.value)} className="h-12" /></div>
          <div className="space-y-2">
            <Label>Jenis Kunjungan</Label>
            <div className="grid grid-cols-2 gap-3">
              <Button type="button" variant={type === "Consignment" ? "default" : "outline"} onClick={() => selectVisitType("Consignment")} className="h-auto min-h-24 flex-col whitespace-normal px-3 py-4 text-center">
                <PackagePlus className="h-5 w-5" />
                <span>Konsinyasi</span>
                <span className="text-xs font-normal opacity-80">Titip Barang</span>
              </Button>
              <Button type="button" variant={type === "Direct Sale" ? "default" : "outline"} onClick={() => selectVisitType("Direct Sale")} className="h-auto min-h-24 flex-col whitespace-normal px-3 py-4 text-center">
                <ShoppingCart className="h-5 w-5" />
                <span>Jual Langsung</span>
                <span className="text-xs font-normal opacity-80">Direct Sale</span>
              </Button>
            </div>
          </div>
          <Button onClick={start} className="h-14 w-full text-base">Lanjut</Button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-md px-5 pb-10 pt-6">
      <button onClick={() => setStarted(false)} className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" />Ganti outlet</button>
      <div className="mt-4 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        {type === "Direct Sale" ? "Jual Langsung" : history.isLoading ? "Memeriksa riwayat…" : isFirst ? "Kunjungan pertama" : "Kunjungan rutin"} · {salesName}
      </div>
      <h1 className="text-2xl font-bold">{outletName}</h1>
       {type === "Consignment" && <p className="mt-2 text-sm text-muted-foreground">Skema stok: <b className="text-foreground">{stockScheme === "accumulation" ? "Akumulasi" : "Tarik Bersih"}</b></p>}

      {type === "Consignment" && history.isLoading ? <p className="mt-6 text-sm text-muted-foreground">Memuat…</p> : (
        <>
          <div className="mt-4 flex items-center justify-between rounded-md border bg-card px-3 py-3 text-sm">
            <span><b>{type === "Consignment" ? "Konsinyasi" : "Jual Langsung"}</b><span className="ml-1 text-muted-foreground">{type === "Consignment" ? "· Titip Barang" : "· Direct Sale"}</span></span>
            <Button type="button" variant="link" onClick={() => setStarted(false)} className="h-auto p-0 text-xs">Ganti</Button>
          </div>

          {!isFirst && type === "Consignment" && (
            <section className="mt-6">
              <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Hitung Titipan Sebelumnya</h2>
              {rows.length === 0 && <p className="mt-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Tidak ada sisa stok di outlet ini.</p>}
              <div className="mt-3 space-y-3">
                {rows.map((r, i) => {
                  const li = lineItems[i];
                  const set = (patch: Partial<Row>) => setRows(rows.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                  return (
                    <div key={i} className="rounded-2xl border bg-card p-4">
                       <div className="flex justify-between gap-2"><b>{r.name}</b><span className="text-sm text-muted-foreground">Titip: {formatQty(r.prev_stock, r.pcs_per_pack)}</span></div>
                       <div className="mt-3"><Field label="Harga per pack" value={r.price} onChange={(v) => set({ price: v })} /></div>
                        {stockScheme === "accumulation" && <><div className="mt-3 text-xs font-medium">Sisa stok di rak</div><div className="mt-1 grid grid-cols-2 gap-2">
                          <label className="block"><span className="text-[11px] text-muted-foreground">Sisa rak (pack)</span><Input aria-label={`Sisa rak ${r.name} pack`} type="number" min={0} step={1} value={r.shelfPack} placeholder="0" onChange={(e) => set({ shelfPack: e.target.value })} className="h-11" /></label>
                          <label className="block"><span className="text-[11px] text-muted-foreground">Sisa rak (pcs)</span><Input aria-label={`Sisa rak ${r.name} pcs`} type="number" min={0} max={r.pcs_per_pack - 1} step={1} value={r.shelfPcs} placeholder="0" onChange={(e) => set({ shelfPcs: e.target.value })} className="h-11" /></label>
                        </div></>}
                        <div className="mt-3 text-xs font-medium">Retur fisik ke gudang</div><div className="mt-1 grid grid-cols-2 gap-2">
                          <label className="block"><span className="text-[11px] text-muted-foreground">Retur fisik (pack)</span><Input aria-label={`Retur fisik ${r.name} pack`} type="number" min={0} step={1} value={r.returnPack} placeholder="0" onChange={(e) => set({ returnPack: e.target.value })} className="h-11" /></label>
                          <label className="block"><span className="text-[11px] text-muted-foreground">Retur fisik (pcs)</span><Input aria-label={`Retur fisik ${r.name} pcs`} type="number" min={0} max={r.pcs_per_pack - 1} step={1} value={r.returnPcs} placeholder="0" onChange={(e) => set({ returnPcs: e.target.value })} className="h-11" /></label>
                        </div>
                      <div className="mt-3 flex justify-between font-mono text-xs">
                         <span>Terjual: <b>{formatQty(li?.sold ?? 0, r.pcs_per_pack)}</b></span>
                         <span>{rp(r.price / r.pcs_per_pack)}/pcs = <b>{rp(li?.subtotal ?? 0)}</b></span>
                      </div>
                        {stockScheme === "accumulation" && <div className="mt-1 font-mono text-xs text-muted-foreground">Sisa di rak: <b>{formatQty(li?.remaining ?? 0, r.pcs_per_pack)}</b></div>}
                        <div className="mt-1 font-mono text-xs text-muted-foreground">Retur fisik ke gudang: <b>{formatQty(li?.returned ?? 0, r.pcs_per_pack)}</b></div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <div className="mt-6">
            <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Tier Harga Nota Ini</h2>
            <div className="mt-2 grid grid-cols-3 rounded-xl border bg-card p-1 text-sm">
              {TIERS.map((t) => (
                <button key={t.id} type="button" onClick={() => changeTier(t.id)} className={`rounded-lg py-2 font-medium ${tier === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{t.label}</button>
              ))}
            </div>
          </div>

          {type === "Direct Sale" && (
             <ItemEditor title="Produk Terjual" items={directItems} setItems={setDirectItems} qtyLabel="Terjual" products={products ?? []} tier={tier} />
          )}

          {type === "Consignment" && (
             <ItemEditor title={isFirst ? "Titip Barang Baru (Drop-off)" : "Titip Barang Baru Hari Ini"} items={newItems} setItems={setNewItems} qtyLabel="Titip" products={products ?? []} tier={tier} />
          )}

          <Button type="button" variant={savedInput ? "secondary" : "outline"} onClick={saveInput} className="mt-4 h-12 w-full">
            {savedInput ? "✓ Input produk tersimpan" : "Simpan Input Produk"}
          </Button>

          {(type === "Direct Sale" || !isFirst) && (
            <section className="mt-6 space-y-2 rounded-2xl border bg-card p-4 font-mono text-sm">
              {type === "Consignment" && <Line k="Utang sebelumnya" v={rp(previousDebt)} />}
              <Line k="Total penjualan" v={rp(totalSales)} />
               <div className="pt-2">
                 <Label htmlFor="visit-discount" className="font-sans">Diskon nota (Rp)</Label>
                 <Input id="visit-discount" inputMode="numeric" type="number" min={0} max={totalSales} step={1} value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" className="mt-1 h-12 text-base" />
                 {discountAmount > totalSales && <p className="mt-1 text-xs text-destructive">Diskon tidak boleh melebihi total penjualan.</p>}
               </div>
              <div className="border-t border-dashed pt-2"><Line k="Total tagihan" v={rp(totalDue)} bold /></div>
              <div className="pt-2">
                <Label className="font-sans">Jumlah dibayar</Label>
                <Input inputMode="numeric" value={paid} onChange={(e) => setPaid(e.target.value)} placeholder="0" className="mt-1 h-12 text-base" />
                 <Button type="button" variant="link" onClick={() => setPaid(String(Math.max(0, totalDue)))} className="mt-1 h-auto p-0 text-xs text-accent">Bayar lunas</Button>
              </div>
              <div className="border-t border-dashed pt-2"><Line k="Sisa utang" v={rp(remainingDebt)} bold /></div>
            </section>
          )}
          {type === "Consignment" && isFirst && (
            <p className="mt-6 rounded-xl bg-secondary p-4 text-sm">Kunjungan pertama — tidak ada perhitungan. Total tagihan: <b>Rp 0</b></p>
          )}

          <div className="mt-6 space-y-2">
            <Label>Catatan (opsional)</Label>
            <Textarea value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>

          <Button onClick={submit} disabled={busy} className="mt-6 h-14 w-full text-base">{busy ? "Menyimpan…" : "Simpan & Buat Nota"}</Button>
        </>
      )}
    </main>
  );
}

function Field({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <Input inputMode="numeric" value={value || ""} placeholder="0" onChange={(e) => onChange(num(e.target.value))} className="h-11" />
    </label>
  );
}

function Line({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return <div className={`flex justify-between ${bold ? "font-semibold" : ""}`}><span>{k}</span><span>{v}</span></div>;
}

function ItemEditor({ title, items, setItems, qtyLabel, products, tier }: { title: string; items: NewItem[]; setItems: (i: NewItem[]) => void; qtyLabel: string; products: Product[]; tier: PriceTier }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const set = (i: number, patch: Partial<NewItem>) => setItems(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const taken = new Set(items.map((i) => i.name.toLowerCase()));
  const matches = products.filter((p) => !taken.has(p.name.toLowerCase()) && p.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 30);
  const pick = (p: Product) => { setItems([...items, { name: p.name, price: tierPrice(p, tier), qty: 0, pcs_per_pack: p.pcs_per_pack }]); setQ(""); setOpen(false); };
  return (
    <section className="mt-6">
      <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{title}</h2>
      <div className="mt-3 space-y-3">
        {items.map((it, i) => {
           const stock = products.find((p) => p.name.toLowerCase() === it.name.toLowerCase())?.warehouse_stock;
           const size = packSize(it.pcs_per_pack);
          return (
            <div key={i} className="rounded-2xl border bg-card p-4">
              <div className="flex items-center justify-between gap-2">
                 <div><b>{it.name}</b>{stock !== undefined && <div className="text-xs text-muted-foreground">Stok gudang: {formatQty(stock, size)}</div>}</div>
                <Button variant="ghost" size="icon" onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label="Hapus"><Trash2 className="h-4 w-4" /></Button>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                 <Field label="Harga per pack" value={it.price} onChange={(v) => set(i, { price: v })} />
                 <div className="self-end pb-2 text-xs text-muted-foreground">{rp(it.price / size)} / pcs</div>
              </div>
               {size === 1 ? <div className="mt-2"><Field label={`${qtyLabel} (pcs)`} value={it.qty} onChange={(v) => set(i, { qty: Math.floor(v) })} /></div> : (
                 <div className="mt-2 grid grid-cols-2 gap-2">
                    <label className="text-[11px] text-muted-foreground">{qtyLabel} (pack)<Input aria-label={`${qtyLabel} ${it.name} pack`} type="number" min={0} step={1} value={Math.floor(it.qty / size) || ""} onChange={(e) => { if (e.target.value === "" || /^\d+$/.test(e.target.value)) set(i, { qty: toPieces(whole(e.target.value), it.qty % size, size) }); }} className="h-11" /></label>
                    <label className="text-[11px] text-muted-foreground">{qtyLabel} (pcs)<Input aria-label={`${qtyLabel} ${it.name} pcs`} type="number" min={0} max={size - 1} step={1} value={it.qty % size || ""} onChange={(e) => { const value = e.target.value; if (value === "" || (!invalidRemainder(value, size) && /^\d+$/.test(value))) set(i, { qty: toPieces(Math.floor(it.qty / size), whole(value), size) }); }} className="h-11" /></label>
                 </div>
               )}
            </div>
          );
        })}
        {open ? (
          <div className="rounded-2xl border bg-card p-3">
            <div className="relative">
              <Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
              <Input autoFocus placeholder="Cari produk master…" value={q} onChange={(e) => setQ(e.target.value)} className="h-11 pl-9" />
            </div>
            <div className="mt-2 max-h-60 divide-y overflow-y-auto">
              {products.length === 0 && <p className="p-3 text-sm text-muted-foreground">Belum ada produk. Tambahkan di <Link to="/products" className="underline">Daftar Produk</Link>.</p>}
              {products.length > 0 && matches.length === 0 && <p className="p-3 text-sm text-muted-foreground">Produk tidak ditemukan.</p>}
              {matches.map((p) => (
                <button key={p.id} type="button" onClick={() => pick(p)} className="flex w-full justify-between px-2 py-3 text-left text-sm hover:bg-muted">
                   <span>{p.name}</span><span className="text-muted-foreground">{rp(tierPrice(p, tier))}/pack · gudang {formatQty(p.warehouse_stock, p.pcs_per_pack)}</span>
                </button>
              ))}
            </div>
            <Button variant="ghost" className="mt-1 w-full" onClick={() => setOpen(false)}>Tutup</Button>
          </div>
        ) : (
          <Button variant="outline" className="h-12 w-full" onClick={() => setOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />Tambah produk
          </Button>
        )}
      </div>
    </section>
  );
}
