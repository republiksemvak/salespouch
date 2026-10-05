import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { ArrowLeft, PackagePlus, Search, ShoppingCart, Trash2 } from "lucide-react";
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
  validateSearch: (s: Record<string, unknown>) => ({ outlet: typeof s.outlet === "string" ? s.outlet : undefined }),
  head: () => ({ meta: [{ title: "Kunjungan Outlet — Sales Pouch" }, { name: "description", content: "Catat titipan, penjualan, dan retur outlet." }, { property: "og:title", content: "Kunjungan Outlet — Sales Pouch" }, { property: "og:description", content: "Catat titipan, penjualan, dan retur outlet." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: VisitPage,
});

const num = (v: string) => Math.max(0, Number(v.replace(/[^\d.]/g, "")) || 0);
const whole = (v: string) => (/^\d+$/.test(v) ? Number(v) : 0);
const invalidRemainder = (v: string, size: number) => v !== "" && (!/^\d+$/.test(v) || Number(v) >= size);

type VisitType = "Consignment" | "Direct Sale";
type StockSource = "sales" | "warehouse";
type Row = { name: string; price: number; prev_stock: number; pcs_per_pack: number; shelfPack: string; shelfPcs: string; returnPack: string; returnPcs: string };
type Member = { user_id: string; profiles: { display_name: string | null; username: string | null } | null };

function VisitPage() {
  const { outlet: preselected } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: products = [] } = useProducts();
  const { data: account } = useProfile();

  const [outletId, setOutletId] = useState(preselected ?? "");
  const [salesName, setSalesName] = useState("");
  const [started, setStarted] = useState(false);
  const [type, setType] = useState<VisitType>("Consignment");
  const [stockSource, setStockSource] = useState<StockSource>("sales");
  const [rows, setRows] = useState<Row[]>([]);
  const [newItems, setNewItems] = useState<NewItem[]>([]);
  const [directItems, setDirectItems] = useState<NewItem[]>([]);
  const [paid, setPaid] = useState("");
  const [discount, setDiscount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [outletQ, setOutletQ] = useState("");
  const [tier, setTier] = useState<PriceTier>("eceran");
  const [savedInput, setSavedInput] = useState(false);

  const stockScheme = account?.profile?.stock_scheme === "accumulation" ? "accumulation" : "clean_pull";

  const { data: outlets = [] } = useQuery({
    queryKey: ["outlets-min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("outlets").select("id,name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: members = [] } = useQuery<Member[]>({
    queryKey: ["visit-sales-members", account?.ownerId],
    enabled: !!account?.ownerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_members")
        .select("user_id,profiles!team_members_user_id_fkey(display_name,username)")
        .eq("owner_id", account!.ownerId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Member[];
    },
  });

  const history = useQuery({
    queryKey: ["last-visit", outletId],
    enabled: started && type === "Consignment" && !!outletId,
    queryFn: () => loadLastVisit(outletId),
  });

  useEffect(() => {
    setSalesName(localStorage.getItem("sp_sales_name") ?? "");
  }, []);

  useEffect(() => {
    if (!history.data) return;
    setRows(history.data.stock.map((s) => ({
      name: s.name,
      price: s.price,
      prev_stock: s.qty,
      pcs_per_pack: packSize(s.pcs_per_pack),
      shelfPack: "",
      shelfPcs: "",
      returnPack: "",
      returnPcs: "",
    })));
  }, [history.data]);

  useEffect(() => setSavedInput(false), [rows, newItems, directItems, type, stockSource]);

  const isFirst = type === "Consignment" && started && history.isSuccess && history.data === null;
  const previousDebt = type === "Consignment" ? history.data?.previousDebt ?? 0 : 0;

  const lineItems: LineItem[] = useMemo(() => {
    if (type === "Direct Sale") {
      return directItems.filter((d) => d.name.trim() && d.qty > 0).map((d) => ({
        name: d.name.trim(), price: d.price, pcs_per_pack: packSize(d.pcs_per_pack), prev_stock: 0,
        sold: d.qty, returned: 0, remaining: 0,
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

  const totalSales = lineItems.reduce((sum, x) => sum + x.subtotal, 0);
  const discountAmount = num(discount);
  const totalDue = previousDebt + totalSales - discountAmount;
  const amountPaid = num(paid);
  const remainingDebt = Math.max(0, totalDue - amountPaid);
  const outletName = outlets.find((o) => o.id === outletId)?.name;
  const matches = outlets.filter((o) => o.name.toLowerCase().includes(outletQ.trim().toLowerCase())).slice(0, 30);

  function changeTier(next: PriceTier) {
    setTier(next);
    const reprice = (items: NewItem[]) => items.map((i) => {
      const p = products.find((x) => x.name.toLowerCase() === i.name.toLowerCase());
      return p ? { ...i, price: tierPrice(p, next) } : i;
    });
    setNewItems(reprice);
    setDirectItems(reprice);
  }

  function selectVisitType(next: VisitType) {
    setType(next);
    setRows([]); setNewItems([]); setDirectItems([]); setPaid(""); setDiscount(""); setSavedInput(false);
    if (next === "Consignment") setStockSource("sales");
  }

  function start() {
    if (!outletId) { toast.error("Pilih outlet dulu"); return; }
    if (!salesName.trim() || salesName.trim().length > 60) { toast.error("Isi nama sales/operator (maks 60 karakter)"); return; }
    if (type === "Consignment" && !findSalesUser(salesName)) { toast.error("Nama Sales belum terdaftar sebagai anggota tim Sales"); return; }
    localStorage.setItem("sp_sales_name", salesName.trim());
    setStarted(true);
  }

  function findSalesUser(name: string) {
    const n = name.trim().toLowerCase();
    return members.find((m) => (m.profiles?.display_name ?? "").trim().toLowerCase() === n || (m.profiles?.username ?? "").trim().toLowerCase() === n)?.user_id ?? null;
  }

  const selectedSalesId = findSalesUser(salesName);
  const salesStock = useQuery({
    queryKey: ["visit-sales-stock", account?.ownerId, selectedSalesId, products.map((p) => p.id).join(",")],
    enabled: started && !!account?.ownerId && !!selectedSalesId && products.length > 0,
    staleTime: 0,
    queryFn: async () => {
      if (!account?.ownerId || !selectedSalesId) throw new Error("Sales belum dipilih");
      const { data: location, error } = await supabase.from("stock_locations")
        .select("id").eq("owner_id", account.ownerId).eq("location_type", "sales")
        .eq("team_member_user_id", selectedSalesId).eq("is_active", true).maybeSingle();
      if (error) throw error;
      if (!location) return new Map<string, number>();
      const balances = await Promise.all(products.map(async (product) => {
        const { data, error: balanceError } = await (supabase as any).rpc("sales_location_balance", {
          _owner_id: account.ownerId, _sales_location_id: location.id, _product_id: product.id,
        });
        if (balanceError) throw balanceError;
        return [product.id, Number(data) || 0] as const;
      }));
      return new Map(balances);
    },
  });

  function validReturns() {
    const invalid = rows.some((r) => {
      const returned = toPieces(whole(r.returnPack), whole(r.returnPcs), r.pcs_per_pack);
      const shelf = stockScheme === "accumulation" ? toPieces(whole(r.shelfPack), whole(r.shelfPcs), r.pcs_per_pack) : 0;
      return (r.returnPack !== "" && !/^\d+$/.test(r.returnPack)) || invalidRemainder(r.returnPcs, r.pcs_per_pack) ||
        (r.shelfPack !== "" && !/^\d+$/.test(r.shelfPack)) ||
        (stockScheme === "accumulation" && invalidRemainder(r.shelfPcs, r.pcs_per_pack)) || returned + shelf > r.prev_stock;
    });
    if (invalid) toast.error("Sisa rak dan retur fisik harus valid serta tidak boleh melebihi titipan sebelumnya");
    return !invalid;
  }

  async function submit() {
    const cleanNew = newItems.filter((i) => i.name.trim() && i.qty > 0).map((i) => ({ ...i, name: i.name.trim() }));
    const valid = z.object({ note: z.string().max(500), sales: z.string().trim().min(1).max(60) }).safeParse({ note, sales: salesName });
    if (!valid.success) { toast.error("Catatan maks 500 karakter dan nama operator wajib diisi"); return; }
    if (type === "Direct Sale" && lineItems.length === 0) { toast.error("Tambahkan produk yang dijual"); return; }
    if (type === "Consignment" && lineItems.length === 0 && cleanNew.length === 0) { toast.error("Tambahkan barang titipan baru"); return; }
    if (type === "Consignment" && !validReturns()) return;
    if (type === "Direct Sale" && stockSource === "warehouse" && directItems.some((item) => {
      const product = products.find((p) => p.name.toLowerCase() === item.name.toLowerCase());
      return product && item.qty > product.warehouse_stock;
    })) { toast.error("Jumlah jual langsung melebihi stok gudang"); return; }
    if (!/^\d*$/.test(discount) || discountAmount > totalSales) { toast.error("Diskon tidak boleh melebihi total penjualan"); return; }
    if (!account) { toast.error("Akun belum siap."); return; }

    const salesUserId = findSalesUser(salesName);
    if (type === "Consignment" && !salesUserId) { toast.error("Sales belum ditemukan di anggota tim"); return; }
    if (type === "Direct Sale" && stockSource === "sales" && !salesUserId) { toast.error("Pilih nama Sales yang terdaftar untuk mengambil stok Sales"); return; }

    setBusy(true);
    try {
      if (type === "Consignment" || stockSource === "sales") {
        const { data: balances, error: stockError } = await salesStock.refetch();
        if (stockError || !balances) throw stockError ?? new Error("Stok Sales belum dapat diperiksa. Coba lagi.");
        const outgoing = type === "Consignment" ? cleanNew : directItems.filter((item) => item.qty > 0);
        for (const item of outgoing) {
          const product = products.find((p) => p.name.toLowerCase() === item.name.toLowerCase());
          if (!product || item.qty > (balances.get(product.id) ?? 0)) {
            throw new Error(`Stok Sales tidak cukup untuk ${item.name}. Periksa muatan Sales terlebih dahulu.`);
          }
        }
      }
      const receipt_number = await nextReceiptNumber();
      const payload = {
        user_id: account.ownerId,
        receipt_number,
        outlet_id: outletId,
        sales_name: salesName.trim(),
        sales_user_id: stockSource === "sales" ? salesUserId : null,
        stock_source: type === "Consignment" ? "sales" : stockSource,
        transaction_type: type,
        stock_scheme: stockScheme,
        line_items: lineItems,
        total_sales: totalSales,
        discount_amount: discountAmount,
        previous_debt: previousDebt,
        total_due: totalDue,
        amount_paid: amountPaid,
        remaining_debt: remainingDebt,
        new_consignment_items: type === "Consignment" ? cleanNew : [],
        custom_note: note.trim() || null,
      };
      const { data, error } = await supabase.from("transactions").insert(payload as any).select("id").single();
      if (error) throw error;
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["products"] }),
        qc.invalidateQueries({ queryKey: ["stock-summary"] }),
        qc.invalidateQueries({ queryKey: ["last-visit", outletId] }),
        qc.invalidateQueries({ queryKey: ["visit-sales-stock"] }),
      ]);
      navigate({ to: "/receipt/$id", params: { id: data.id } });
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  }

  if (!started) return (
    <main className="mx-auto min-h-screen max-w-md px-5 pb-10 pt-6">
      <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" /> Kembali</Link>
      <h1 className="mt-4 text-2xl font-bold">Mulai Kunjungan</h1>
      <div className="mt-6 space-y-5">
        <div className="space-y-2"><Label>Outlet</Label>{outletId && outletName ? <div className="flex items-center justify-between rounded-md border bg-card px-3 py-3"><b>{outletName}</b><button type="button" onClick={() => { setOutletId(""); setOutletQ(""); }} className="text-xs text-accent underline">Ganti</button></div> : <><div className="relative"><Search className="absolute left-3 top-4 h-4 w-4 text-muted-foreground" /><Input placeholder="Cari nama toko…" value={outletQ} onChange={(e) => setOutletQ(e.target.value)} className="h-12 pl-9" autoFocus /></div><div className="max-h-72 divide-y overflow-y-auto rounded-md border bg-card">{matches.length === 0 && <p className="p-3 text-sm text-muted-foreground">Toko tidak ditemukan.</p>}{matches.map((o) => <button key={o.id} type="button" onClick={() => setOutletId(o.id)} className="block w-full px-3 py-3 text-left hover:bg-muted">{o.name}</button>)}</div></>}</div>
        <div className="space-y-2"><Label>Nama Sales / Operator</Label><Input value={salesName} maxLength={60} onChange={(e) => setSalesName(e.target.value)} className="h-12" /></div>
        <div className="space-y-2"><Label>Jenis Kunjungan</Label><div className="grid grid-cols-2 gap-3"><Button type="button" variant={type === "Consignment" ? "default" : "outline"} onClick={() => selectVisitType("Consignment")} className="h-auto min-h-24 flex-col whitespace-normal px-3 py-4"><PackagePlus className="h-5 w-5" /><span>Konsinyasi</span><span className="text-xs font-normal opacity-80">Titip Barang · Stok Sales</span></Button><Button type="button" variant={type === "Direct Sale" ? "default" : "outline"} onClick={() => selectVisitType("Direct Sale")} className="h-auto min-h-24 flex-col whitespace-normal px-3 py-4"><ShoppingCart className="h-5 w-5" /><span>Jual Langsung</span><span className="text-xs font-normal opacity-80">Pilih asal stok</span></Button></div></div>
        {type === "Direct Sale" && <StockSourceSelector value={stockSource} onChange={setStockSource} />}
        <Button onClick={start} className="h-14 w-full text-base">Lanjut</Button>
      </div>
    </main>
  );

  return (
    <main className="mx-auto min-h-screen max-w-md px-5 pb-10 pt-6">
      <button onClick={() => setStarted(false)} className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" /> Ganti outlet / sumber stok</button>
      <div className="mt-4 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">{type === "Direct Sale" ? `Jual Langsung · ${stockSource === "warehouse" ? "Gudang" : "Sales"}` : history.isLoading ? "Memeriksa riwayat…" : isFirst ? "Kunjungan pertama" : "Kunjungan rutin"} · {salesName}</div>
      <h1 className="text-2xl font-bold">{outletName}</h1>
      {type === "Consignment" && <p className="mt-2 text-sm text-muted-foreground">Skema stok: <b className="text-foreground">{stockScheme === "accumulation" ? "Akumulasi" : "Tarik Bersih"}</b> · Sumber: <b className="text-foreground">Sales</b></p>}
      {type === "Direct Sale" && <div className="mt-3"><StockSourceSelector value={stockSource} onChange={setStockSource} /></div>}

      {type === "Consignment" && history.isLoading ? <p className="mt-6 text-sm text-muted-foreground">Memuat…</p> : <>
        {type === "Consignment" && !isFirst && <PreviousStockEditor rows={rows} setRows={setRows} lineItems={lineItems} stockScheme={stockScheme} />}
        <div className="mt-6"><h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Tier Harga Nota Ini</h2><div className="mt-2 grid grid-cols-3 rounded-xl border bg-card p-1 text-sm">{TIERS.map((t) => <button key={t.id} type="button" onClick={() => changeTier(t.id)} className={`rounded-lg py-2 font-medium ${tier === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{t.label}</button>)}</div></div>
        {type === "Direct Sale" && <ItemEditor title="Produk Terjual" items={directItems} setItems={setDirectItems} qtyLabel="Terjual" products={products} tier={tier} stockLabel={stockSource === "sales" ? "Stok Sales" : "Stok gudang"} stockBalances={stockSource === "sales" ? salesStock.data : undefined} />}
        {type === "Consignment" && <ItemEditor title={isFirst ? "Titip Barang Baru (Drop-off)" : "Titip Barang Baru Hari Ini"} items={newItems} setItems={setNewItems} qtyLabel="Titip" products={products} tier={tier} stockLabel="Stok Sales" stockBalances={salesStock.data} />}
        {(type === "Consignment" || stockSource === "sales") && salesStock.isPending && <p className="mt-2 text-xs text-muted-foreground">Memeriksa stok Sales…</p>}
        {(type === "Consignment" || stockSource === "sales") && salesStock.isError && <p className="mt-2 text-xs text-destructive">Stok Sales belum dapat dimuat. Coba lagi sebelum menyimpan.</p>}
        <Button type="button" variant={savedInput ? "secondary" : "outline"} onClick={() => { if (type === "Consignment" && !validReturns()) return; setSavedInput(true); toast.success("Input produk tersimpan"); }} className="mt-4 h-12 w-full">{savedInput ? "✓ Input produk tersimpan" : "Simpan Input Produk"}</Button>
        {(type === "Direct Sale" || !isFirst) && <section className="mt-6 space-y-2 rounded-2xl border bg-card p-4 font-mono text-sm">{type === "Consignment" && <Line k="Utang sebelumnya" v={rp(previousDebt)} />}<Line k="Total penjualan" v={rp(totalSales)} /><div className="pt-2"><Label className="font-sans">Diskon nota (Rp)</Label><Input inputMode="numeric" type="number" min={0} max={totalSales} step={1} value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" className="mt-1 h-12 text-base" /></div><div className="border-t border-dashed pt-2"><Line k="Total tagihan" v={rp(totalDue)} bold /></div><div className="pt-2"><Label className="font-sans">Jumlah dibayar</Label><Input inputMode="numeric" value={paid} onChange={(e) => setPaid(e.target.value)} placeholder="0" className="mt-1 h-12 text-base" /><Button type="button" variant="link" onClick={() => setPaid(String(Math.max(0, totalDue)))} className="mt-1 h-auto p-0 text-xs text-accent">Bayar lunas</Button></div><div className="border-t border-dashed pt-2"><Line k="Sisa utang" v={rp(remainingDebt)} bold /></div></section>}
        {type === "Consignment" && isFirst && <p className="mt-6 rounded-xl bg-secondary p-4 text-sm">Kunjungan pertama — tidak ada perhitungan. Total tagihan: <b>Rp 0</b></p>}
        <div className="mt-6 space-y-2"><Label>Catatan (opsional)</Label><Textarea value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} rows={2} /></div>
        <Button onClick={submit} disabled={busy} className="mt-6 h-14 w-full text-base">{busy ? "Menyimpan…" : "Simpan & Buat Nota"}</Button>
      </>}
    </main>
  );
}

function StockSourceSelector({ value, onChange }: { value: StockSource; onChange: (v: StockSource) => void }) {
  return <section className="rounded-2xl border bg-card p-3"><div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Asal stok</div><div className="mt-2 grid grid-cols-2 gap-2"><button type="button" onClick={() => onChange("sales")} className={`rounded-xl border p-3 text-left ${value === "sales" ? "border-primary bg-primary/10" : ""}`}><b>Stok Sales</b><div className="mt-1 text-[11px] text-muted-foreground">Barang yang sudah dimuat dari Gudang ke kendaraan Sales.</div></button><button type="button" onClick={() => onChange("warehouse")} className={`rounded-xl border p-3 text-left ${value === "warehouse" ? "border-primary bg-primary/10" : ""}`}><b>Stok Gudang</b><div className="mt-1 text-[11px] text-muted-foreground">Jual langsung dari Gudang Utama.</div></button></div></section>;
}

function PreviousStockEditor({ rows, setRows, lineItems, stockScheme }: { rows: Row[]; setRows: React.Dispatch<React.SetStateAction<Row[]>>; lineItems: LineItem[]; stockScheme: "accumulation" | "clean_pull" }) {
  return <section className="mt-6"><h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Hitung Titipan Sebelumnya</h2>{rows.length === 0 && <p className="mt-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Tidak ada sisa stok di outlet ini.</p>}<div className="mt-3 space-y-3">{rows.map((r, i) => { const li = lineItems[i]; const set = (patch: Partial<Row>) => setRows((current) => current.map((x, j) => j === i ? { ...x, ...patch } : x)); return <div key={i} className="rounded-2xl border bg-card p-4"><div className="flex justify-between gap-2"><b>{r.name}</b><span className="text-sm text-muted-foreground">Titip: {formatQty(r.prev_stock, r.pcs_per_pack)}</span></div><div className="mt-3"><Field label="Harga per pack" value={r.price} onChange={(v) => set({ price: v })} /></div>{stockScheme === "accumulation" && <QtyPair label="Sisa rak" pack={r.shelfPack} pcs={r.shelfPcs} size={r.pcs_per_pack} setPack={(v) => set({ shelfPack: v })} setPcs={(v) => set({ shelfPcs: v })} /> }<QtyPair label="Retur fisik ke gudang" pack={r.returnPack} pcs={r.returnPcs} size={r.pcs_per_pack} setPack={(v) => set({ returnPack: v })} setPcs={(v) => set({ returnPcs: v })} /><div className="mt-3 flex justify-between font-mono text-xs"><span>Terjual: <b>{formatQty(li?.sold ?? 0, r.pcs_per_pack)}</b></span><span>{rp(r.price / r.pcs_per_pack)}/pcs = <b>{rp(li?.subtotal ?? 0)}</b></span></div>{stockScheme === "accumulation" && <div className="mt-1 font-mono text-xs text-muted-foreground">Sisa di rak: <b>{formatQty(li?.remaining ?? 0, r.pcs_per_pack)}</b></div>}<div className="mt-1 font-mono text-xs text-muted-foreground">Retur fisik: <b>{formatQty(li?.returned ?? 0, r.pcs_per_pack)}</b></div></div>; })}</div></section>;
}

function QtyPair({ label, pack, pcs, size, setPack, setPcs }: { label: string; pack: string; pcs: string; size: number; setPack: (v: string) => void; setPcs: (v: string) => void }) {
  return <div className="mt-3"><div className="text-xs font-medium">{label}</div><div className="mt-1 grid grid-cols-2 gap-2"><label className="text-[11px] text-muted-foreground">{label} (pack)<Input type="number" min={0} step={1} value={pack} placeholder="0" onChange={(e) => setPack(e.target.value)} className="h-11" /></label><label className="text-[11px] text-muted-foreground">{label} (pcs)<Input type="number" min={0} max={size - 1} step={1} value={pcs} placeholder="0" onChange={(e) => setPcs(e.target.value)} className="h-11" /></label></div></div>;
}

function ItemEditor({ title, items, setItems, qtyLabel, products, tier, stockLabel, stockBalances }: { title: string; items: NewItem[]; setItems: (i: NewItem[]) => void; qtyLabel: string; products: Product[]; tier: PriceTier; stockLabel: string; stockBalances?: Map<string, number> }) {
  const [q, setQ] = useState(""); const [open, setOpen] = useState(false);
  const set = (i: number, patch: Partial<NewItem>) => setItems(items.map((x, j) => j === i ? { ...x, ...patch } : x));
  const taken = new Set(items.map((i) => i.name.toLowerCase()));
  const matches = products.filter((p) => !taken.has(p.name.toLowerCase()) && p.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 30);
  const pick = (p: Product) => { setItems([...items, { name: p.name, price: tierPrice(p, tier), qty: 0, pcs_per_pack: p.pcs_per_pack }]); setQ(""); setOpen(false); };
  return <section className="mt-6"><h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{title}</h2><div className="mt-3 space-y-3">{items.map((it, i) => { const product = products.find((p) => p.name.toLowerCase() === it.name.toLowerCase()); const stock = stockBalances ? stockBalances.get(product?.id ?? "") ?? 0 : stockLabel === "Stok gudang" ? product?.warehouse_stock : undefined; const size = packSize(it.pcs_per_pack); return <div key={i} className="rounded-2xl border bg-card p-4"><div className="flex items-center justify-between gap-2"><div><b>{it.name}</b>{stock !== undefined && <div className="text-xs text-muted-foreground">{stockLabel}: {formatQty(stock, size)}</div>}{stock !== undefined && it.qty > stock && <div className="text-xs text-destructive">Jumlah melebihi {stockLabel.toLowerCase()}</div>}</div><Button variant="ghost" size="icon" onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label="Hapus"><Trash2 className="h-4 w-4" /></Button></div><div className="mt-2 grid grid-cols-2 gap-2"><Field label="Harga per pack" value={it.price} onChange={(v) => set(i, { price: v })} /><div className="self-end pb-2 text-xs text-muted-foreground">{rp(it.price / size)} / pcs</div></div>{size === 1 ? <Field label={`${qtyLabel} (pcs)`} value={it.qty} onChange={(v) => set(i, { qty: Math.floor(v) })} /> : <div className="mt-2 grid grid-cols-2 gap-2"><label className="text-[11px] text-muted-foreground">{qtyLabel} (pack)<Input type="number" min={0} step={1} value={Math.floor(it.qty / size) || ""} onChange={(e) => { if (e.target.value === "" || /^\d+$/.test(e.target.value)) set(i, { qty: toPieces(whole(e.target.value), it.qty % size, size) }); }} className="h-11" /></label><label className="text-[11px] text-muted-foreground">{qtyLabel} (pcs)<Input type="number" min={0} max={size - 1} step={1} value={it.qty % size || ""} onChange={(e) => { const v = e.target.value; if (v === "" || (!invalidRemainder(v, size) && /^\d+$/.test(v))) set(i, { qty: toPieces(Math.floor(it.qty / size), whole(v), size) }); }} className="h-11" /></label></div>}</div>; })}{open ? <div className="rounded-2xl border bg-card p-3"><Input autoFocus placeholder="Cari produk master…" value={q} onChange={(e) => setQ(e.target.value)} /> <div className="mt-2 max-h-56 overflow-y-auto divide-y">{matches.map((p) => <button key={p.id} type="button" onClick={() => pick(p)} className="block w-full px-2 py-3 text-left text-sm hover:bg-muted">{p.name}</button>)}{matches.length === 0 && <div className="p-2 text-xs text-muted-foreground">Produk tidak ditemukan.</div>}</div><Button type="button" variant="ghost" onClick={() => setOpen(false)} className="mt-2">Tutup</Button></div> : <Button type="button" variant="outline" onClick={() => setOpen(true)} className="w-full"><Search className="mr-2 h-4 w-4" /> Tambah Produk</Button>}</div></section>;
}

function Field({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) { return <label className="block"><span className="text-[11px] text-muted-foreground">{label}</span><Input inputMode="numeric" value={value || ""} placeholder="0" onChange={(e) => onChange(num(e.target.value))} className="h-11" /></label>; }
function Line({ k, v, bold }: { k: string; v: string; bold?: boolean }) { return <div className={`flex justify-between ${bold ? "font-semibold" : ""}`}><span>{k}</span><span>{v}</span></div>; }
