import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Download, Phone, Store, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProducts } from "@/lib/products";
import { useProfile } from "@/hooks/use-profile";
import { rp, type LineItem } from "@/lib/visit";
import { packSize } from "@/lib/units";
import { Button } from "@/components/ui/button";
import { useTeamPermissions } from "@/hooks/use-team-permissions";
import { hasAccess } from "@/lib/team-access";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Laporan Keuangan & Piutang — Sales Pouch" },
      { name: "description", content: "Laporan Laba Rugi, Omset, dan Piutang Outlet." },
    ],
  }),
  component: ReportsPage,
});

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const key = (n: string) => n.trim().toLowerCase();
type ProductReport = { name: string; qty: number; omset: number; hpp: number; profit: number };

function ReportsPage() {
  const { data: account, isLoading } = useProfile();
  if (isLoading) return <div className="p-10 text-center">Memuat…</div>;
  if (!account) return <div className="p-10 text-center text-muted-foreground">Memuat…</div>;
  return <OwnerReportsPage />;
}

function OwnerReportsPage() {
  const { data: account } = useProfile();
  const { data: access } = useTeamPermissions(account?.role === "manager" || account?.role === "admin");
  const permissions = access?.permissions ?? [];
  const canFinance = account?.role === "owner" || hasAccess(permissions, "reports.finance");
  const canReceivables = account?.role === "owner" || hasAccess(permissions, "reports.receivables");
  const canExport = account?.role === "owner" || hasAccess(permissions, "reports.export");
  const [tab, setTab] = useState<"finance" | "aging">(canFinance ? "finance" : "aging");
  return (
    <main className="mx-auto min-h-screen max-w-md px-5 pb-12 pt-6">
      <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" /> Kembali</Link>
      <h1 className="mt-4 text-2xl font-bold">Laporan</h1>
      {canFinance && canReceivables && <div className="mt-4 grid grid-cols-2 rounded-xl bg-muted p-1 text-xs font-semibold">
        <button onClick={() => setTab("finance")} className={`rounded-lg py-2 ${tab === "finance" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}>Laba Rugi & Omset</button>
        <button onClick={() => setTab("aging")} className={`rounded-lg py-2 ${tab === "aging" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}>Piutang Outlet</button>
      </div>}
      {canFinance && tab === "finance" ? <FinancialReportTab canExport={canExport} /> : canReceivables ? <OutletReceivablesTab /> : <div className="mt-6 rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Belum ada akses laporan.</div>}
    </main>
  );
}

// Direct Gudang included in financial report totals.
function FinancialReportTab({ canExport = true }: { canExport?: boolean }) {
  const now = new Date();
  const [from, setFrom] = useState(ymd(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(ymd(now));
  const { data: products } = useProducts();
  const { data: account } = useProfile();

  const { data: reportData, isLoading } = useQuery({
    queryKey: ["report", from, to, account?.ownerId],
    enabled: !!account?.ownerId,
    queryFn: async () => {
      // 1. Transaksi lapangan (konsinyasi & direct sale sales)
      const { data: txs, error: txError } = await supabase
        .from("transactions")
        .select("receipt_number,visit_date,sales_name,transaction_type,line_items,total_sales,discount_amount,amount_paid,remaining_debt,outlets(name)")
        .eq("user_id", account!.ownerId)
        .gte("visit_date", `${from}T00:00:00`)
        .lte("visit_date", `${to}T23:59:59`)
        .order("visit_date");
      if (txError) throw txError;

      // 2. Direct sales dari Gudang
      const { data: wds, error: wdsError } = await supabase
        .from("warehouse_direct_sales")
        .select("receipt_number,sale_date,line_items,total_sales,discount_amount,amount_paid,buyer_name,outlets:buyer_outlet_id(name)")
        .eq("owner_id", account!.ownerId)
        .gte("sale_date", `${from}T00:00:00`)
        .lte("sale_date", `${to}T23:59:59`)
        .order("sale_date");
      if (wdsError) throw wdsError;

      return { txs: txs ?? [], wds: wds ?? [] };
    },
  });

  const report = useMemo(() => {
    const costs = new Map((products ?? []).map(p => [key(p.name), { price: p.cost_price, size: p.pcs_per_pack }]));
    const hppByProduct = new Map<string, number>();

    const txRows = (reportData?.txs ?? []).map(t => {
      let hpp = 0;
      const gross = Number(t.total_sales) || 0;
      const discount = Number(t.discount_amount) || 0;

      for (const li of (t.line_items as LineItem[]) ?? []) {
        const qty = Number(li.sold) || 0;
        if (!qty) continue;
        const p = costs.get(key(li.name));
        const c = ((p?.price ?? 0) * qty) / packSize(li.pcs_per_pack ?? p?.size);
        hpp += c;
        hppByProduct.set(key(li.name), (hppByProduct.get(key(li.name)) ?? 0) + c);
      }

      const omset = gross - discount;
      return {
        nota: t.receipt_number,
        tanggal: t.visit_date.slice(0, 10),
        toko: (t.outlets as { name: string } | null)?.name ?? "-",
        sales: t.sales_name || "Sales",
        jenis: t.transaction_type === "Direct Sale" ? "Direct Sale" : "Konsinyasi",
        bruto: gross,
        diskon: discount,
        omset,
        hpp,
        profit: omset - hpp,
        dibayar: Number(t.amount_paid) || 0,
        sisa: Number(t.remaining_debt) || 0,
      };
    });

    const wdsRows = (reportData?.wds ?? []).map(w => {
      let hpp = 0;
      const gross = Number(w.total_sales) || 0;
      const discount = Number(w.discount_amount) || 0;

      for (const li of (w.line_items as any[]) ?? []) {
        const qty = Number(li.qty) || 0;
        if (!qty) continue;
        const p = costs.get(key(li.name));
        const c = ((p?.price ?? 0) * qty) / packSize(li.pcs_per_pack ?? p?.size);
        hpp += c;
        hppByProduct.set(key(li.name), (hppByProduct.get(key(li.name)) ?? 0) + c);
      }

      const omset = gross - discount;
      const debt = Math.max(0, omset - (Number(w.amount_paid) || 0));

      return {
        nota: w.receipt_number,
        tanggal: w.sale_date.slice(0, 10),
        toko: (w.outlets as { name: string } | null)?.name || w.buyer_name || "Direct Gudang",
        sales: "Gudang Utama",
        jenis: "Direct Gudang",
        bruto: gross,
        diskon: discount,
        omset,
        hpp,
        profit: omset - hpp,
        dibayar: Number(w.amount_paid) || 0,
        sisa: debt,
      };
    });

    const rows = [...txRows, ...wdsRows].sort((a, b) => b.tanggal.localeCompare(a.tanggal));
    const totalBruto = rows.reduce((s, r) => s + r.bruto, 0);
    const totalDiskon = rows.reduce((s, r) => s + r.diskon, 0);
    const totalOmset = rows.reduce((s, r) => s + r.omset, 0);
    const totalHpp = rows.reduce((s, r) => s + r.hpp, 0);
    const totalProfit = totalOmset - totalHpp;
    const totalDibayar = rows.reduce((s, r) => s + r.dibayar, 0);
    const totalSisa = rows.reduce((s, r) => s + r.sisa, 0);

    const productMap = new Map<string, { name: string; qty: number; omset: number }>();
    for (const t of reportData?.txs ?? []) {
      const gross = Number(t.total_sales) || 0;
      const discount = Number(t.discount_amount) || 0;
      const factor = gross ? (gross - discount) / gross : 1;
      for (const li of (t.line_items as LineItem[]) ?? []) {
        const qty = Number(li.sold) || 0;
        if (!qty || !li.name) continue;
        const k = key(li.name);
        const cur = productMap.get(k) ?? { name: li.name, qty: 0, omset: 0 };
        cur.qty += qty;
        cur.omset += (Number(li.subtotal) || 0) * factor;
        productMap.set(k, cur);
      }
    }
    for (const w of reportData?.wds ?? []) {
      const gross = Number(w.total_sales) || 0;
      const discount = Number(w.discount_amount) || 0;
      const factor = gross ? (gross - discount) / gross : 1;
      for (const li of (w.line_items as any[]) ?? []) {
        const qty = Number(li.qty) || 0;
        if (!qty || !li.name) continue;
        const k = key(li.name);
        const cur = productMap.get(k) ?? { name: li.name, qty: 0, omset: 0 };
        cur.qty += qty;
        cur.omset += (Number(li.subtotal) || 0) * factor;
        productMap.set(k, cur);
      }
    }
    const productRows: ProductReport[] = [...productMap.values()]
      .map(p => ({ ...p, hpp: hppByProduct.get(key(p.name)) ?? 0, profit: p.omset - (hppByProduct.get(key(p.name)) ?? 0) }))
      .sort((a, b) => b.omset - a.omset);

    return {
      rows,
      products: productRows,
      totals: {
        bruto: totalBruto,
        diskon: totalDiskon,
        omset: totalOmset,
        hpp: totalHpp,
        profit: totalProfit,
        dibayar: totalDibayar,
        sisa: totalSisa,
      },
    };
  }, [reportData, products]);

  async function download() {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const n1 = report.rows.length + 1;
    const s1 = XLSX.utils.aoa_to_sheet([
      ["Tanggal", "No Nota", "Toko", "Sales", "Jenis", "Penjualan", "Diskon Nota", "Omset Bersih", "HPP", "Profit", "Dibayar", "Sisa Hutang"],
      ...report.rows.map(x => [x.tanggal, x.nota, x.toko, x.sales, x.jenis, x.bruto, x.diskon, x.omset, x.hpp, x.profit, x.dibayar, x.sisa]),
      ["TOTAL", "", "", "", "", ...["F", "G", "H", "I", "J", "K", "L"].map(col => ({ f: `SUM(${col}2:${col}${n1})` }))],
    ]);
    report.rows.forEach((x, i) => {
      s1[`H${i + 2}`] = { t: "n", f: `F${i + 2}-G${i + 2}`, v: x.omset };
      s1[`J${i + 2}`] = { t: "n", f: `H${i + 2}-I${i + 2}`, v: x.profit };
    });
    s1["!cols"] = [12,18,20,14,12,14,14,14,14,14,14,14].map(wch => ({ wch }));
    XLSX.utils.book_append_sheet(wb, s1, "Transaksi");
    const n2 = report.products.length + 1;
    const s2 = XLSX.utils.aoa_to_sheet([
      ["Produk", "Terjual (pcs)", "Omset", "HPP", "Profit"],
      ...report.products.map((p, i) => [p.name, p.qty, p.omset, p.hpp, { t: "n", f: `C${i + 2}-D${i + 2}`, v: p.omset - p.hpp }]),
      ["TOTAL", { f: `SUM(B2:B${n2})` }, { f: `SUM(C2:C${n2})` }, { f: `SUM(D2:D${n2})` }, { f: `SUM(E2:E${n2})` }],
    ]);
    s2["!cols"] = [24,14,14,14,14].map(wch => ({ wch }));
    XLSX.utils.book_append_sheet(wb, s2, "Per Produk");
    XLSX.writeFile(wb, `Laporan-${from}_sd_${to}.xlsx`);
  }

  const margin = report.totals.omset ? (report.totals.profit / report.totals.omset) * 100 : 0;
  const topSelling = [...report.products].sort((a,b) => b.qty - a.qty).slice(0,5);
  const topRevenue = [...report.products].sort((a,b) => b.omset - a.omset).slice(0,5);

  return (
    <div className="mt-4">
      <div className="grid grid-cols-2 gap-2"><label className="text-xs text-muted-foreground">Dari<Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-11" /></label><label className="text-xs text-muted-foreground">Sampai<Input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-11" /></label></div>
      <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl border bg-card p-4"><Box label="Omset Bersih" v={rp(report.totals.omset)} /><Box label="HPP" v={rp(report.totals.hpp)} /><Box label="Profit" v={rp(report.totals.profit)} strong /><Box label="Margin" v={`${margin.toFixed(1)}%`} /><div className="col-span-2 border-t border-dashed pt-2 text-xs text-muted-foreground">Uang diterima: <b className="text-foreground">{rp(report.totals.dibayar)}</b> · {report.rows.length} transaksi</div></div>
      {canExport && <Button onClick={download} disabled={!report.rows.length} className="mt-4 h-12 w-full"><Download className="mr-1 h-4 w-4" /> Download Excel</Button>}
      <ProductInsights topSelling={topSelling} topRevenue={topRevenue} />
      <h2 className="mt-6 font-semibold">Performa Produk</h2>
      <div className="mt-2 space-y-2">{isLoading && <p className="text-sm text-muted-foreground">Memuat data…</p>}{!isLoading && !report.products.length && <p className="text-sm text-muted-foreground">Belum ada transaksi di periode ini.</p>}{report.products.map(p => <div key={p.name} className="rounded-xl border bg-card p-3 text-sm"><div className="flex justify-between font-medium"><span className="truncate">{p.name}</span><span>{p.qty} pcs</span></div><div className="mt-1 flex justify-between text-xs text-muted-foreground"><span>Omset {rp(p.omset)}</span><span>HPP {rp(p.hpp)}</span><b className={p.profit < 0 ? "text-destructive" : "text-primary"}>{rp(p.profit)}</b></div></div>)}</div>
    </div>
  );
}

function OutletReceivablesTab() {
  const { data: account } = useProfile();
  const { data: rows, isLoading, error } = useQuery({
    queryKey: ["outlet-receivables", account?.ownerId],
    enabled: !!account?.ownerId,
    queryFn: async () => {
      const ownerId = account!.ownerId;

      // Read the owner's own consignment transactions and calculate the current
      // outlet stock locally. This keeps the report usable even when an older
      // database function is still cached in PostgREST.
      const [{ data: txs, error: txError }, { data: outlets, error: outletError }] = await Promise.all([
        supabase
          .from("transactions")
          .select("id,outlet_id,visit_date,created_at,stock_scheme,line_items,new_consignment_items")
          .eq("user_id", ownerId)
          .eq("transaction_type", "Consignment")
          .order("visit_date", { ascending: false })
          .order("created_at", { ascending: false }),
        supabase
          .from("outlets")
          .select("id,name,owner_phone")
          .eq("user_id", ownerId),
      ]);

      if (txError) throw txError;
      if (outletError) throw outletError;

      type Tx = {
        id: string;
        outlet_id: string;
        visit_date: string;
        created_at: string;
        stock_scheme: string | null;
        line_items: any[] | null;
        new_consignment_items: any[] | null;
      };

      const latest = new Map<string, Tx>();
      for (const raw of (txs ?? []) as Tx[]) {
        const activeOld = raw.stock_scheme === "accumulation"
          ? (raw.line_items ?? []).reduce((sum, item) => sum + Math.max(0, Number(item?.remaining) || 0), 0)
          : 0;
        const activeNew = (raw.new_consignment_items ?? []).reduce(
          (sum, item) => sum + Math.max(0, Number(item?.qty) || 0),
          0,
        );
        if (activeOld + activeNew > 0 && !latest.has(raw.outlet_id)) {
          latest.set(raw.outlet_id, raw);
        }
      }

      return (outlets ?? [])
        .map((outlet) => {
          const visit = latest.get(outlet.id);
          if (!visit) return null;

          const oldItems = visit.stock_scheme === "accumulation" ? (visit.line_items ?? []) : [];
          const newItems = visit.new_consignment_items ?? [];
          const values = [
            ...oldItems.map((item) => ({
              qty: Math.max(0, Number(item?.remaining) || 0),
              price: Math.max(0, Number(item?.price) || 0),
              pcsPerPack: Math.max(1, Number(item?.pcs_per_pack) || 1),
            })),
            ...newItems.map((item) => ({
              qty: Math.max(0, Number(item?.qty) || 0),
              price: Math.max(0, Number(item?.price) || 0),
              pcsPerPack: Math.max(1, Number(item?.pcs_per_pack) || 1),
            })),
          ];
          const stockPcs = values.reduce((sum, item) => sum + item.qty, 0);
          const receivableValue = values.reduce(
            (sum, item) => sum + (item.qty * item.price) / item.pcsPerPack,
            0,
          );

          return {
            outlet_id: outlet.id,
            outlet_name: outlet.name,
            phone: outlet.owner_phone ?? null,
            stock_pcs: stockPcs,
            receivable_value: receivableValue,
            stock_since: visit.visit_date,
          };
        })
        .filter((row): row is NonNullable<typeof row> => !!row && row.receivable_value > 0)
        .sort((a, b) => b.receivable_value - a.receivable_value || a.outlet_name.localeCompare(b.outlet_name));
    },
  });

  const totalValue = useMemo(
    () => (rows ?? []).reduce((sum, row) => sum + Number(row.receivable_value || 0), 0),
    [rows],
  );
  const totalStock = useMemo(
    () => (rows ?? []).reduce((sum, row) => sum + Number(row.stock_pcs || 0), 0),
    [rows],
  );

  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-2xl border bg-card p-4">
        <div className="text-xs text-muted-foreground">Total Piutang Outlet</div>
        <div className="mt-1 text-2xl font-bold text-destructive">{rp(totalValue)}</div>
        <div className="mt-2 text-xs text-muted-foreground">
          Nilai barang titipan yang masih berada di outlet · {totalStock} pcs
        </div>
      </div>

      {error && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">Gagal memuat Piutang Outlet: {(error as Error).message}</div>}
      {isLoading && <p className="text-sm text-muted-foreground">Memuat rincian outlet…</p>}
      {!isLoading && !error && !(rows ?? []).length && <div className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">🎉 Tidak ada Piutang Outlet saat ini.</div>}

      <div className="space-y-3">
        {(rows ?? []).map((o) => (
          <div key={o.outlet_id} className="space-y-3 rounded-2xl border bg-card p-4 text-sm shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 font-bold"><Store className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="truncate">{o.outlet_name}</span></div>
                <div className="mt-1 text-xs text-muted-foreground">Stok titipan: {Number(o.stock_pcs).toLocaleString("id-ID")} pcs</div>
              </div>
              <div className="shrink-0 text-right"><div className="text-xs text-muted-foreground">Nilai Piutang</div><div className="font-bold text-destructive">{rp(Number(o.receivable_value))}</div></div>
            </div>
            <div className="rounded-xl bg-muted/60 p-3 text-xs">
              <div className="flex justify-between"><span>Nilai stok outlet</span><b>{rp(Number(o.receivable_value))}</b></div>
              <div className="mt-1 flex justify-between text-muted-foreground"><span>Stok yang masih dititipkan</span><span>{Number(o.stock_pcs).toLocaleString("id-ID")} pcs</span></div>
            </div>
            <div className="flex items-center justify-between border-t pt-2 text-xs">
              <span className="text-[11px] text-muted-foreground">Stok sejak {o.stock_since?.slice(0, 10) ?? "-"}</span>
              {o.phone ? (
                <a href={`https://wa.me/${o.phone.replace(/^0/, "62").replace(/\D/g, "")}?text=${encodeURIComponent(`Halo ${o.outlet_name}, mengonfirmasi nilai barang titipan yang masih tercatat di Sales Pouch sebesar ${rp(Number(o.receivable_value))}. Mohon konfirmasi saat kunjungan berikutnya. Terima kasih 🙏`)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:underline"><Phone className="h-3.5 w-3.5" /> Konfirmasi</a>
              ) : <span className="text-[11px] italic text-muted-foreground">No HP belum diisi</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProductInsights({ topSelling, topRevenue }: { topSelling: ProductReport[]; topRevenue: ProductReport[] }) { return <section className="mt-5 overflow-hidden rounded-2xl border bg-card"><div className="flex items-center justify-between border-b px-3.5 py-3"><div><div className="text-sm font-bold">Insight Produk</div><div className="text-[10px] text-muted-foreground">Sesuai rentang tanggal di atas</div></div><TrendingUp className="h-4 w-4 text-muted-foreground" /></div><div className="grid grid-cols-2 divide-x"><InsightList title="Terlaris" rows={topSelling} max={topSelling[0]?.qty || 1} value={p => `${p.qty} pcs`} /><InsightList title="Omset Terbesar" rows={topRevenue} max={topRevenue[0]?.omset || 1} value={p => rp(p.omset)} revenue /></div><div className="border-t px-3.5 py-2.5 text-[10px] text-muted-foreground"><b className="text-foreground">Catatan:</b> Terlaris = pcs terjual. Omset = setelah diskon.</div></section>; }
function InsightList({ title, rows, max, value, revenue }: { title: string; rows: ProductReport[]; max: number; value: (p: ProductReport) => string; revenue?: boolean }) { return <div className="min-w-0 p-3"><div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</div><div className="mt-2 space-y-2.5">{!rows.length && <div className="text-[11px] text-muted-foreground">Belum ada data</div>}{rows.map(p => <div key={`${title}-${p.name}`}><div className="flex items-center justify-between gap-2 text-[11px]"><span className="truncate font-medium">{p.name}</span><span className="shrink-0 text-muted-foreground">{value(p)}</span></div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(8, Math.round(((revenue ? p.omset : p.qty) / max) * 100))}%` }} /></div></div>)}</div></div>; }
function Box({ label, v, strong }: { label: string; v: string; strong?: boolean }) { return <div><div className="text-[10px] uppercase text-muted-foreground">{label}</div><div className={strong ? "text-lg font-bold text-primary" : "font-semibold"}>{v}</div></div>; }
