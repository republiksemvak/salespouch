import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { ArrowLeft, Plus, Search, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { loadLastVisit, nextReceiptNumber, rp, type LineItem, type NewItem } from "@/lib/visit";
import { useProducts, rememberProducts, type Product } from "@/lib/products";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/visit")({
  validateSearch: (s: Record<string, unknown>) => ({ outlet: typeof s['outlet'] === "string" ? s['outlet'] : undefined }),
  head: () => ({ meta: [{ title: "Kunjungan Outlet — Sales Pouch" }, { name: "description", content: "Catat kunjungan & konsinyasi." }] }),
  component: VisitPage,
});

const num = (v: string) => Math.max(0, Number(v.replace(/[^\d.]/g, "")) || 0);

type Row = { name: string; price: number; prev_stock: number; sold: number; returned: number };

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
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [outletQ, setOutletQ] = useState("");
  const { data: products } = useProducts();

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
    enabled: started && !!outletId,
    queryFn: () => loadLastVisit(outletId),
  });

  useEffect(() => {
    if (!history.data) return;
    setRows(history.data.stock.map((s) => ({ name: s.name, price: s.price, prev_stock: s.qty, sold: 0, returned: 0 })));
  }, [history.data]);

  const isFirst = started && history.isSuccess && history.data === null;
  const previousDebt = history.data?.previousDebt ?? 0;

  const lineItems: LineItem[] = useMemo(() => {
    if (type === "Direct Sale")
      return directItems.filter((d) => d.name.trim() && d.qty > 0).map((d) => ({
        name: d.name.trim(), price: d.price, prev_stock: 0, sold: d.qty, returned: 0, remaining: 0, subtotal: d.qty * d.price,
      }));
    return rows.map((r) => ({
      ...r, remaining: Math.max(0, r.prev_stock - r.sold - r.returned), subtotal: r.sold * r.price,
    }));
  }, [rows, directItems, type]);

  const totalSales = lineItems.reduce((a, l) => a + l.subtotal, 0);
  const totalDue = previousDebt + totalSales;
  const amountPaid = num(paid);
  const remainingDebt = Math.max(0, totalDue - amountPaid);
  const overStock = type === "Consignment" && rows.some((r) => r.sold + r.returned > r.prev_stock);

  function start() {
    if (!outletId) { toast.error("Pilih outlet dulu"); return; }
    const n = salesName.trim();
    if (!n || n.length > 60) { toast.error("Isi nama sales (maks 60 karakter)"); return; }
    localStorage.setItem("sp_sales_name", n);
    setStarted(true);
  }

  async function submit() {
    const cleanNew = newItems.filter((i) => i.name.trim() && i.qty > 0).map((i) => ({ ...i, name: i.name.trim() }));
    const schema = z.object({ note: z.string().max(500), sales: z.string().trim().min(1).max(60) });
    const v = schema.safeParse({ note, sales: salesName });
    if (!v.success) { toast.error("Catatan maks 500 karakter"); return; }
    if (overStock) { toast.error("Terjual + retur melebihi stok titipan"); return; }
    if (type === "Direct Sale" && lineItems.length === 0) { toast.error("Tambahkan produk yang dijual"); return; }
    if (type === "Consignment" && lineItems.length === 0 && cleanNew.length === 0)
      { toast.error("Tambahkan barang titipan baru"); return; }
    setBusy(true);
    try {
      const receipt_number = await nextReceiptNumber();
      const { data, error } = await supabase.from("transactions").insert({
        receipt_number, outlet_id: outletId, sales_name: salesName.trim(), transaction_type: type,
        line_items: lineItems, total_sales: totalSales, previous_debt: previousDebt, total_due: totalDue,
        amount_paid: amountPaid, remaining_debt: remainingDebt,
        new_consignment_items: type === "Consignment" ? cleanNew : [],
        custom_note: note.trim() || null,
      }).select("id").single();
      if (error) throw error;
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
          <Button onClick={start} className="h-14 w-full text-base">Lanjut</Button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-md px-5 pb-10 pt-6">
      <button onClick={() => setStarted(false)} className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" />Ganti outlet</button>
      <div className="mt-4 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        {history.isLoading ? "Memeriksa riwayat…" : isFirst ? "Kunjungan pertama" : "Kunjungan rutin"} · {salesName}
      </div>
      <h1 className="text-2xl font-bold">{outletName}</h1>

      {history.isLoading ? <p className="mt-6 text-sm text-muted-foreground">Memuat…</p> : (
        <>
          {!isFirst && (
            <div className="mt-4 grid grid-cols-2 rounded-xl border bg-card p-1 text-sm">
              {(["Consignment", "Direct Sale"] as const).map((t) => (
                <button key={t} onClick={() => setType(t)} className={`rounded-lg py-2 font-medium ${type === t ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
                  {t === "Consignment" ? "Konsinyasi" : "Jual Langsung"}
                </button>
              ))}
            </div>
          )}

          {!isFirst && type === "Consignment" && (
            <section className="mt-6">
              <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Hitung Titipan Sebelumnya</h2>
              {rows.length === 0 && <p className="mt-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Tidak ada sisa stok di outlet ini.</p>}
              <div className="mt-3 space-y-3">
                {rows.map((r, i) => {
                  const li = lineItems[i];
                  const bad = r.sold + r.returned > r.prev_stock;
                  const set = (patch: Partial<Row>) => setRows(rows.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                  return (
                    <div key={i} className={`rounded-2xl border bg-card p-4 ${bad ? "border-destructive" : ""}`}>
                      <div className="flex justify-between"><b>{r.name}</b><span className="text-sm text-muted-foreground">Titip: {r.prev_stock}</span></div>
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <Field label="Harga" value={r.price} onChange={(v) => set({ price: v })} />
                        <Field label="Terjual" value={r.sold} onChange={(v) => set({ sold: v })} />
                        <Field label="Retur" value={r.returned} onChange={(v) => set({ returned: v })} />
                      </div>
                      <div className="mt-3 flex justify-between font-mono text-xs">
                        <span>Sisa stok: <b>{li?.remaining}</b></span>
                        <span>{r.sold} × {rp(r.price)} = <b>{rp(li?.subtotal ?? 0)}</b></span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {type === "Direct Sale" && (
            <ItemEditor title="Produk Terjual" items={directItems} setItems={setDirectItems} qtyLabel="Qty" products={products ?? []} />
          )}

          {type === "Consignment" && (
            <ItemEditor title={isFirst ? "Titip Barang Baru (Drop-off)" : "Titip Barang Baru Hari Ini"} items={newItems} setItems={setNewItems} qtyLabel="Qty Titip" products={products ?? []} />
          )}

          {!isFirst && (
            <section className="mt-6 space-y-2 rounded-2xl border bg-card p-4 font-mono text-sm">
              <Line k="Utang sebelumnya" v={rp(previousDebt)} />
              <Line k="Total penjualan" v={rp(totalSales)} />
              <div className="border-t border-dashed pt-2"><Line k="Total tagihan" v={rp(totalDue)} bold /></div>
              <div className="pt-2">
                <Label className="font-sans">Jumlah dibayar</Label>
                <Input inputMode="numeric" value={paid} onChange={(e) => setPaid(e.target.value)} placeholder="0" className="mt-1 h-12 text-base" />
                <button type="button" onClick={() => setPaid(String(totalDue))} className="mt-1 text-xs text-accent underline">Bayar lunas</button>
              </div>
              <div className="border-t border-dashed pt-2"><Line k="Sisa utang" v={rp(remainingDebt)} bold /></div>
            </section>
          )}
          {isFirst && (
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

function ItemEditor({ title, items, setItems, qtyLabel, products }: { title: string; items: NewItem[]; setItems: (i: NewItem[]) => void; qtyLabel: string; products: Product[] }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const set = (i: number, patch: Partial<NewItem>) => setItems(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const taken = new Set(items.map((i) => i.name.toLowerCase()));
  const matches = products.filter((p) => !taken.has(p.name.toLowerCase()) && p.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 30);
  const pick = (p: Product) => { setItems([...items, { name: p.name, price: p.price, qty: 0 }]); setQ(""); setOpen(false); };
  return (
    <section className="mt-6">
      <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{title}</h2>
      <div className="mt-3 space-y-3">
        {items.map((it, i) => {
          const stock = products.find((p) => p.name.toLowerCase() === it.name.toLowerCase())?.warehouse_stock;
          return (
            <div key={i} className="rounded-2xl border bg-card p-4">
              <div className="flex items-center justify-between gap-2">
                <div><b>{it.name}</b>{stock !== undefined && <div className="text-xs text-muted-foreground">Stok gudang: {stock}</div>}</div>
                <Button variant="ghost" size="icon" onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label="Hapus"><Trash2 className="h-4 w-4" /></Button>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Field label="Harga" value={it.price} onChange={(v) => set(i, { price: v })} />
                <Field label={qtyLabel} value={it.qty} onChange={(v) => set(i, { qty: v })} />
              </div>
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
                  <span>{p.name}</span><span className="text-muted-foreground">{rp(p.price)} · gudang {p.warehouse_stock}</span>
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
