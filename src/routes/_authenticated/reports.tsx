import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProducts } from "@/lib/products";
import { rp, type LineItem } from "@/lib/visit";
import { packSize } from "@/lib/units";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [{ title: "Laporan Keuangan — Sales Pouch" }, { name: "description", content: "Omset dan profit penjualan pack dan pcs berdasarkan HPP." }, { property: "og:title", content: "Laporan Keuangan — Sales Pouch" }, { property: "og:description", content: "Omset dan profit penjualan pack dan pcs berdasarkan HPP." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: ReportsPage,
});

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const k = (n: string) => n.trim().toLowerCase();

function ReportsPage() {
  const now = new Date();
  const [from, setFrom] = useState(ymd(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(ymd(now));
  const { data: products } = useProducts();
  const { data: txs, isLoading } = useQuery({
    queryKey: ["report", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("receipt_number,visit_date,sales_name,transaction_type,line_items,total_sales,amount_paid,remaining_debt,outlets(name)")
        .gte("visit_date", from + "T00:00:00").lte("visit_date", to + "T23:59:59")
        .order("visit_date");
      if (error) throw error;
      return data;
    },
  });

  const r = useMemo(() => {
     const cost = new Map((products ?? []).map((p) => [k(p.name), { price: p.cost_price, size: p.pcs_per_pack }]));
    const perProduct = new Map<string, { name: string; qty: number; omset: number; hpp: number }>();
    const rows = (txs ?? []).map((t) => {
      let hpp = 0;
      for (const li of (t.line_items as LineItem[]) ?? []) {
        const q = Number(li.sold) || 0; if (!q) continue;
         const productCost = cost.get(k(li.name));
         const c = (productCost?.price ?? 0) * q / packSize(li.pcs_per_pack ?? productCost?.size);
         const om = Number(li.subtotal) || Math.round(q * Number(li.price) / packSize(li.pcs_per_pack));
        hpp += c;
        const e = perProduct.get(k(li.name)) ?? { name: li.name, qty: 0, omset: 0, hpp: 0 };
        e.qty += q; e.omset += om; e.hpp += c; perProduct.set(k(li.name), e);
      }
      const omset = Number(t.total_sales);
      return { nota: t.receipt_number, tanggal: t.visit_date.slice(0, 10), toko: (t.outlets as { name: string } | null)?.name ?? "-", sales: t.sales_name, jenis: t.transaction_type, omset, hpp, profit: omset - hpp, dibayar: Number(t.amount_paid), sisa: Number(t.remaining_debt) };
    });
    const tot = rows.reduce((a, x) => ({ omset: a.omset + x.omset, hpp: a.hpp + x.hpp, profit: a.profit + x.profit, dibayar: a.dibayar + x.dibayar }), { omset: 0, hpp: 0, profit: 0, dibayar: 0 });
    return { rows, tot, products: [...perProduct.values()].sort((a, b) => b.omset - a.omset) };
  }, [txs, products]);

  async function download() {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const n1 = r.rows.length + 1;
    const s1 = XLSX.utils.aoa_to_sheet([
      ["Tanggal", "No Nota", "Toko", "Sales", "Jenis", "Omset", "HPP", "Profit", "Dibayar", "Sisa Hutang"],
      ...r.rows.map((x) => [x.tanggal, x.nota, x.toko, x.sales, x.jenis, x.omset, x.hpp, x.profit, x.dibayar, x.sisa]),
      ["TOTAL", "", "", "", "", { f: `SUM(F2:F${n1})` }, { f: `SUM(G2:G${n1})` }, { f: `SUM(H2:H${n1})` }, { f: `SUM(I2:I${n1})` }, { f: `SUM(J2:J${n1})` }],
    ]);
    r.rows.forEach((x, i) => { s1[`H${i + 2}`] = { t: "n", f: `F${i + 2}-G${i + 2}`, v: x.profit }; });
    s1["!cols"] = [12, 18, 20, 14, 12, 14, 14, 14, 14, 14].map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, s1, "Transaksi");
    const n2 = r.products.length + 1;
    const s2 = XLSX.utils.aoa_to_sheet([
      ["Produk", "Terjual (pcs)", "Omset", "HPP", "Profit"],
      ...r.products.map((p, i) => [p.name, p.qty, p.omset, p.hpp, { t: "n", f: `C${i + 2}-D${i + 2}`, v: p.omset - p.hpp }]),
      ["TOTAL", { f: `SUM(B2:B${n2})` }, { f: `SUM(C2:C${n2})` }, { f: `SUM(D2:D${n2})` }, { f: `SUM(E2:E${n2})` }],
    ]);
    s2["!cols"] = [24, 14, 14, 14, 14].map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, s2, "Per Produk");
    XLSX.writeFile(wb, `Laporan-${from}_sd_${to}.xlsx`);
  }

  const margin = r.tot.omset ? (r.tot.profit / r.tot.omset) * 100 : 0;
  return (
    <main className="mx-auto min-h-screen max-w-md px-5 pb-10 pt-6">
      <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" />Kembali</Link>
      <h1 className="mt-4 text-2xl font-bold">Laporan Keuangan</h1>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <label className="text-xs text-muted-foreground">Dari<Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-11" /></label>
        <label className="text-xs text-muted-foreground">Sampai<Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-11" /></label>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl border bg-card p-4">
        <Box label="Omset" v={rp(r.tot.omset)} /><Box label="HPP" v={rp(r.tot.hpp)} />
        <Box label="Profit" v={rp(r.tot.profit)} strong /><Box label="Margin" v={margin.toFixed(1) + "%"} />
        <div className="col-span-2 border-t border-dashed pt-2 text-xs text-muted-foreground">Uang diterima: <b className="text-foreground">{rp(r.tot.dibayar)}</b> · {r.rows.length} transaksi</div>
      </div>
      <Button onClick={download} disabled={!r.rows.length} className="mt-4 h-12 w-full"><Download className="mr-1 h-4 w-4" />Download Excel</Button>
      <p className="mt-2 text-[11px] text-muted-foreground">HPP dihitung dari Harga Modal di Master Produk saat ini.</p>
      <h2 className="mt-6 font-semibold">Per Produk</h2>
      <div className="mt-2 space-y-2">
        {isLoading && <p className="text-sm text-muted-foreground">Memuat…</p>}
        {!isLoading && !r.products.length && <p className="text-sm text-muted-foreground">Belum ada penjualan di periode ini.</p>}
        {r.products.map((p) => (
          <div key={p.name} className="rounded-xl border bg-card p-3 text-sm">
            <div className="flex justify-between font-medium"><span className="truncate">{p.name}</span><span>{p.qty} pcs</span></div>
            <div className="mt-1 flex justify-between text-xs text-muted-foreground"><span>Omset {rp(p.omset)}</span><span>HPP {rp(p.hpp)}</span><b className={p.omset - p.hpp < 0 ? "text-destructive" : "text-primary"}>{rp(p.omset - p.hpp)}</b></div>
          </div>
        ))}
      </div>
    </main>
  );
}

function Box({ label, v, strong }: { label: string; v: string; strong?: boolean }) {
  return <div><div className="text-[10px] uppercase text-muted-foreground">{label}</div><div className={strong ? "text-lg font-bold text-primary" : "font-semibold"}>{v}</div></div>;
}
