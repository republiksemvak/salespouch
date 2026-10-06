import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Download, TrendingUp, Phone, Calendar, Store } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProducts } from "@/lib/products";
import { useProfile } from "@/hooks/use-profile";
import { aggregateProductSales } from "@/lib/product-sales";
import { rp, type LineItem } from "@/lib/visit";
import { packSize } from "@/lib/units";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Laporan Keuangan & Piutang — Sales Pouch" },
      { name: "description", content: "Laporan Laba Rugi, Omset, dan Penuaan Piutang Toko (AR Aging)." },
    ],
  }),
  component: ReportsPage,
});

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const k = (n: string) => n.trim().toLowerCase();

type ProductReport = { name: string; qty: number; omset: number; hpp: number; profit: number };

function ReportsPage() {
  const { data: account, isLoading } = useProfile();
  if (isLoading) return <div className="p-10 text-center">Memuat…</div>;
  if (account?.role !== "owner") {
    return <div className="p-10 text-center text-destructive">Hanya Owner yang dapat melihat laporan.</div>;
  }
  return <OwnerReportsPage />;
}

function OwnerReportsPage() {
  const [activeTab, setActiveTab] = useState<"finance" | "aging">("finance");

  return (
    <main className="mx-auto min-h-screen max-w-md px-5 pb-12 pt-6">
      <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeft className="h-4 w-4" /> Kembali ke Dashboard
      </Link>

      <div className="mt-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Laporan</h1>
      </div>

      <div className="mt-4 grid grid-cols-2 rounded-xl bg-muted p-1 text-xs font-semibold">
        <button
          onClick={() => setActiveTab("finance")}
          className={`rounded-lg py-2 transition-all ${
            activeTab === "finance" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
          }`}
        >
          Laba Rugi & Omset
        </button>
        <button
          onClick={() => setActiveTab("aging")}
          className={`rounded-lg py-2 transition-all ${
            activeTab === "aging" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
          }`}
        >
          Penuaan Piutang (AR)
        </button>
      </div>

      {activeTab === "finance" ? <FinancialReportTab /> : <ArAgingTab />}
    </main>
  );
}

function FinancialReportTab() {
  const now = new Date();
  const [from, setFrom] = useState(ymd(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(ymd(now));
  const { data: products } = useProducts();

  const { data: txs, isLoading } = useQuery({
    queryKey: ["report", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select(
          "receipt_number,visit_date,sales_name,transaction_type,line_items,total_sales,discount_amount,amount_paid,remaining_debt,outlets(name)"
        )
        .gte("visit_date", from + "T00:00:00")
        .lte("visit_date", to + "T23:59:59")
        .order("visit_date");
      if (error) throw error;
      return data;
    },
  });

  const r = useMemo(() => {
    const cost = new Map(
      (products ?? []).map((p) => [k(p.name), { price: p.cost_price, size: p.pcs_per_pack }])
    );
    const hppByProduct = new Map<string, number>();
    const rows = (txs ?? []).map((t) => {
      let hpp = 0;
      const gross = Number(t.total_sales) || 0;
      const discount = Number(t.discount_amount) || 0;
      for (const li of (t.line_items as LineItem[]) ?? []) {
        const q = Number(li.sold) || 0;
        if (!q) continue;
        const productCost = cost.get(k(li.name));
        const c = ((productCost?.price ?? 0) * q) / packSize(li.pcs_per_pack ?? productCost?.size);
        hpp += c;
        hppByProduct.set(k(li.name), (hppByProduct.get(k(li.name)) ?? 0) + c);
      }
      const omset = gross - discount;
      return {
        nota: t.receipt_number,
        tanggal: t.visit_date.slice(0, 10),
        toko: (t.outlets as { name: string } | null)?.name ?? "-",
        sales: t.sales_name,
        jenis: t.transaction_type,
        bruto: gross,
        diskon: discount,
        omset,
        hpp,
        profit: omset - hpp,
        dibayar: Number(t.amount_paid),
        sisa: Number(t.remaining_debt),
      };
    });

    const tot = rows.reduce(
      (a, x) => ({
        omset: a.omset + x.omset,
        hpp: a.hpp + x.hpp,
        profit: a.profit + x.profit,
        dibayar: a.dibayar + x.dibayar,
      }),
      { omset: 0, hpp: 0, profit: 0, dibayar: 0 }
    );

    const productSales = aggregateProductSales(txs ?? []);
    const reportProducts: ProductReport[] = productSales
      .map((p) => ({
        ...p,
        hpp: hppByProduct.get(k(p.name)) ?? 0,
        profit: p.omset - (hppByProduct.get(k(p.name)) ?? 0),
      }))
      .sort((a, b) => b.omset - a.omset);

    return { rows, tot, products: reportProducts };
  }, [txs, products]);

  async function download() {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const n1 = r.rows.length + 1;
    const s1 = XLSX.utils.aoa_to_sheet([
      [
        "Tanggal",
        "No Nota",
        "Toko",
        "Sales",
        "Jenis",
        "Penjualan",
        "Diskon Nota",
        "Omset Bersih",
        "HPP",
        "Profit",
        "Dibayar",
        "Sisa Hutang",
      ],
      ...r.rows.map((x) => [
        x.tanggal,
        x.nota,
        x.toko,
        x.sales,
        x.jenis,
        x.bruto,
        x.diskon,
        x.omset,
        x.hpp,
        x.profit,
        x.dibayar,
        x.sisa,
      ]),
      [
        "TOTAL",
        "",
        "",
        "",
        "",
        ...["F", "G", "H", "I", "J", "K", "L"].map((col) => ({
          f: `SUM(${col}2:${col}${n1})`,
        })),
      ],
    ]);
    r.rows.forEach((x, i) => {
      s1[`H${i + 2}`] = { t: "n", f: `F${i + 2}-G${i + 2}`, v: x.omset };
      s1[`J${i + 2}`] = { t: "n", f: `H${i + 2}-I${i + 2}`, v: x.profit };
    });
    s1["!cols"] = [12, 18, 20, 14, 12, 14, 14, 14, 14, 14, 14, 14].map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, s1, "Transaksi");

    const n2 = r.products.length + 1;
    const s2 = XLSX.utils.aoa_to_sheet([
      ["Produk", "Terjual (pcs)", "Omset", "HPP", "Profit"],
      ...r.products.map((p, i) => [
        p.name,
        p.qty,
        p.omset,
        p.hpp,
        { t: "n", f: `C${i + 2}-D${i + 2}`, v: p.omset - p.hpp },
      ]),
      [
        "TOTAL",
        { f: `SUM(B2:B${n2})` },
        { f: `SUM(C2:C${n2})` },
        { f: `SUM(D2:D${n2})` },
        { f: `SUM(E2:E${n2})` },
      ],
    ]);
    s2["!cols"] = [24, 14, 14, 14, 14].map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, s2, "Per Produk");

    XLSX.writeFile(wb, `Laporan-${from}_sd_${to}.xlsx`);
  }

  const margin = r.tot.omset ? (r.tot.profit / r.tot.omset) * 100 : 0;
  const topSelling = [...r.products].sort((a, b) => b.qty - a.qty).slice(0, 5);
  const topRevenue = [...r.products].sort((a, b) => b.omset - a.omset).slice(0, 5);

  return (
    <div className="mt-4">
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-muted-foreground">
          Dari
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-11" />
        </label>
        <label className="text-xs text-muted-foreground">
          Sampai
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-11" />
        </label>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl border bg-card p-4">
        <Box label="Omset Bersih" v={rp(r.tot.omset)} />
        <Box label="HPP" v={rp(r.tot.hpp)} />
        <Box label="Profit" v={rp(r.tot.profit)} strong />
        <Box label="Margin" v={margin.toFixed(1) + "%"} />
        <div className="col-span-2 border-t border-dashed pt-2 text-xs text-muted-foreground">
          Uang diterima: <b className="text-foreground">{rp(r.tot.dibayar)}</b> · {r.rows.length} transaksi
        </div>
      </div>

      <Button onClick={download} disabled={!r.rows.length} className="mt-4 h-12 w-full">
        <Download className="mr-1 h-4 w-4" /> Download Excel
      </Button>

      <ProductInsights topSelling={topSelling} topRevenue={topRevenue} />

      <h2 className="mt-6 font-semibold">Performa Produk</h2>
      <div className="mt-2 space-y-2">
        {isLoading && <p className="text-sm text-muted-foreground">Memuat data…</p>}
        {!isLoading && !r.products.length && (
          <p className="text-sm text-muted-foreground">Belum ada transaksi di periode ini.</p>
        )}
        {r.products.map((p) => (
          <div key={p.name} className="rounded-xl border bg-card p-3 text-sm">
            <div className="flex justify-between font-medium">
              <span className="truncate">{p.name}</span>
              <span>{p.qty} pcs</span>
            </div>
            <div className="mt-1 flex justify-between text-xs text-muted-foreground">
              <span>Omset {rp(p.omset)}</span>
              <span>HPP {rp(p.hpp)}</span>
              <b className={p.omset - p.hpp < 0 ? "text-destructive" : "text-primary"}>
                {rp(p.omset - p.hpp)}
              </b>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ArAgingTab() {
  const { data: debtRows, isLoading } = useQuery({
    queryKey: ["ar-aging-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id,outlet_id,remaining_debt,visit_date,receipt_number,outlets(id,name,phone,address)")
        .gt("remaining_debt", 0)
        .order("visit_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const agingSummary = useMemo(() => {
    const today = new Date().getTime();
    const map = new Map<
      string,
      {
        outletId: string;
        outletName: string;
        phone: string | null;
        address: string | null;
        totalDebt: number;
        bucket0_7: number;
        bucket8_14: number;
        bucket15_30: number;
        bucketOver30: number;
        oldestDate: string;
      }
    >();

    let totalAllDebt = 0;
    let sum0_7 = 0;
    let sum8_14 = 0;
    let sum15_30 = 0;
    let sumOver30 = 0;

    for (const t of debtRows ?? []) {
      const o = t.outlets as { id: string; name: string; phone?: string | null; address?: string | null } | null;
      if (!o) continue;

      const debt = Number(t.remaining_debt) || 0;
      if (debt <= 0) continue;

      const visitTime = new Date(t.visit_date).getTime();
      const diffDays = Math.floor((today - visitTime) / (1000 * 60 * 60 * 24));

      totalAllDebt += debt;

      if (!map.has(o.id)) {
        map.set(o.id, {
          outletId: o.id,
          outletName: o.name,
          phone: o.phone ?? null,
          address: o.address ?? null,
          totalDebt: 0,
          bucket0_7: 0,
          bucket8_14: 0,
          bucket15_30: 0,
          bucketOver30: 0,
          oldestDate: t.visit_date.slice(0, 10),
        });
      }

      const row = map.get(o.id)!;
      row.totalDebt += debt;

      if (diffDays <= 7) {
        row.bucket0_7 += debt;
        sum0_7 += debt;
      } else if (diffDays <= 14) {
        row.bucket8_14 += debt;
        sum8_14 += debt;
      } else if (diffDays <= 30) {
        row.bucket15_30 += debt;
        sum15_30 += debt;
      } else {
        row.bucketOver30 += debt;
        sumOver30 += debt;
      }
    }

    const list = Array.from(map.values()).sort((a, b) => b.totalDebt - a.totalDebt);
    return { list, totalAllDebt, sum0_7, sum8_14, sum15_30, sumOver30 };
  }, [debtRows]);

  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-2xl border bg-card p-4">
        <div className="text-xs text-muted-foreground">Total Piutang Mengendap di Toko</div>
        <div className="mt-1 text-2xl font-bold text-destructive">{rp(agingSummary.totalAllDebt)}</div>

        <div className="mt-4 grid grid-cols-2 gap-2 border-t pt-3 text-xs">
          <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-700 dark:text-emerald-400">
            <div className="text-[10px] uppercase font-semibold">0–7 Hari (Lancar)</div>
            <div className="font-bold">{rp(agingSummary.sum0_7)}</div>
          </div>
          <div className="rounded-lg bg-amber-500/10 p-2 text-amber-700 dark:text-amber-400">
            <div className="text-[10px] uppercase font-semibold">8–14 Hari (Perhatian)</div>
            <div className="font-bold">{rp(agingSummary.sum8_14)}</div>
          </div>
          <div className="rounded-lg bg-orange-500/10 p-2 text-orange-700 dark:text-orange-400">
            <div className="text-[10px] uppercase font-semibold">15–30 Hari (Kritis)</div>
            <div className="font-bold">{rp(agingSummary.sum15_30)}</div>
          </div>
          <div className="rounded-lg bg-rose-500/10 p-2 text-rose-700 dark:text-rose-400">
            <div className="text-[10px] uppercase font-semibold">&gt; 30 Hari (Macet)</div>
            <div className="font-bold">{rp(agingSummary.sumOver30)}</div>
          </div>
        </div>
      </div>

      <h2 className="font-semibold text-sm">Daftar Toko Menunggak ({agingSummary.list.length})</h2>

      {isLoading && <p className="text-sm text-muted-foreground">Memuat rincian toko…</p>}
      {!isLoading && !agingSummary.list.length && (
        <div className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">
          🎉 Tidak ada piutang tertunggak saat ini. Semua toko lunas!
        </div>
      )}

      <div className="space-y-3">
        {agingSummary.list.map((outlet) => (
          <div key={outlet.outletId} className="space-y-2 rounded-2xl border bg-card p-4 text-sm shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-1.5 font-bold">
                  <Store className="h-4 w-4 text-muted-foreground" />
                  {outlet.outletName}
                </div>
                {outlet.address && (
                  <div className="max-w-[220px] truncate text-[11px] text-muted-foreground">{outlet.address}</div>
                )}
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Total Hutang</div>
                <div className="font-bold text-destructive">{rp(outlet.totalDebt)}</div>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-1 rounded-xl bg-muted/60 p-2 text-center text-[10px]">
              <div>
                <div className="text-muted-foreground">0-7 hr</div>
                <div className="font-semibold">{outlet.bucket0_7 ? rp(outlet.bucket0_7) : "-"}</div>
              </div>
              <div>
                <div className="font-medium text-amber-600">8-14 hr</div>
                <div className="font-semibold">{outlet.bucket8_14 ? rp(outlet.bucket8_14) : "-"}</div>
              </div>
              <div>
                <div className="font-medium text-orange-600">15-30 hr</div>
                <div className="font-semibold">{outlet.bucket15_30 ? rp(outlet.bucket15_30) : "-"}</div>
              </div>
              <div>
                <div className="font-bold text-rose-600">&gt;30 hr</div>
                <div className="font-bold text-rose-600">{outlet.bucketOver30 ? rp(outlet.bucketOver30) : "-"}</div>
              </div>
            </div>

            <div className="flex items-center justify-between border-t pt-1 text-xs">
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Calendar className="h-3 w-3" /> Sejak {outlet.oldestDate}
              </span>

              {outlet.phone ? (
                <a
                  href={`https://wa.me/${outlet.phone.replace(/^0/, "62").replace(/\D/g, "")}?text=${encodeURIComponent(
                    `Halo ${outlet.outletName}, mengonfirmasi catatan tagihan titip barang di Sales Pouch sebesar ${rp(outlet.totalDebt)}. Mohon konfirmasi jadwal pembayaran saat kunjungan berikutnya ya. Terima kasih 🙏`
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:underline"
                >
                  <Phone className="h-3.5 w-3.5" /> WhatsApp Tagihan
                </a>
              ) : (
                <span className="text-[11px] italic text-muted-foreground">No HP belum diisi</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProductInsights({ topSelling, topRevenue }: { topSelling: ProductReport[]; topRevenue: ProductReport[] }) {
  const maxQty = topSelling[0]?.qty || 1;
  const maxRevenue = topRevenue[0]?.omset || 1;
  return (
    <section className="mt-5 overflow-hidden rounded-2xl border bg-card">
      <div className="flex items-center justify-between border-b px-3.5 py-3">
        <div>
          <div className="text-sm font-bold">Insight Produk</div>
          <div className="text-[10px] text-muted-foreground">Sesuai rentang tanggal di atas</div>
        </div>
        <TrendingUp className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="grid grid-cols-2 divide-x">
        <InsightList title="Terlaris" rows={topSelling} max={maxQty} value={(p) => `${p.qty} pcs`} />
        <InsightList title="Omset Terbesar" rows={topRevenue} max={maxRevenue} value={(p) => rp(p.omset)} revenue />
      </div>
      <div className="border-t px-3.5 py-2.5 text-[10px] leading-relaxed text-muted-foreground">
        <b className="text-foreground">Catatan:</b> Terlaris = pcs terjual. Omset = setelah diskon.
      </div>
    </section>
  );
}

function InsightList({
  title,
  rows,
  max,
  value,
  revenue,
}: {
  title: string;
  rows: ProductReport[];
  max: number;
  value: (p: ProductReport) => string;
  revenue?: boolean;
}) {
  return (
    <div className="min-w-0 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
      <div className="mt-2 space-y-2.5">
        {!rows.length && <div className="text-[11px] text-muted-foreground">Belum ada data</div>}
        {rows.map((p) => {
          const ratio = Math.max(8, Math.round(((revenue ? p.omset : p.qty) / max) * 100));
          return (
            <div key={`${title}-${p.name}`} className="min-w-0">
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="truncate font-medium">{p.name}</span>
                <span className="shrink-0 text-muted-foreground">{value(p)}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${ratio}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Box({ label, v, strong }: { label: string; v: string; strong?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className={strong ? "text-lg font-bold text-primary" : "font-semibold"}>{v}</div>
    </div>
  );
}
