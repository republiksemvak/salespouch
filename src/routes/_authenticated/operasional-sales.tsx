import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ChevronDown, ChevronUp, Download, FileSpreadsheet, Loader2, Wallet } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import * as XLSX from "xlsx";
import { useProfile } from "@/hooks/use-profile";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { isSuperAdminEmail } from "@/lib/access";
import { listTeam } from "@/lib/team.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/operasional-sales")({
  head: () => ({ meta: [{ title: "Operasional Sales — Sales Pouch" }, { name: "description", content: "Ringkasan uang jalan dan pengeluaran operasional Sales." }] }),
  component: OperasionalSales,
});

type Fund = { id: string; sales_id: string; amount: number | string; note: string | null; given_at: string; transaction_type: "in" | "out" };
type Expense = { id: string; sales_id: string; category: string; amount: number | string; note: string | null; spent_at: string };
type TeamMember = { user_id: string; profiles?: { user_email?: string; username?: string; display_name?: string } | null };

type Summary = { salesId: string; name: string; moneyIn: number; expense: number; ownerReduction: number; balance: number; expenses: Expense[] };

function rupiah(value: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

function OperasionalSales() {
  const { data: profileData, isLoading: profileLoading } = useProfile();
  const { data: isAdmin, isLoading: adminLoading } = useIsAdmin();
  const fetchTeam = useServerFn(listTeam);
  const ownerId = profileData?.ownerId;
  const isSuperAdmin = isSuperAdminEmail(profileData?.email) || !!isAdmin;
  const canAccess = isSuperAdmin || profileData?.role === "owner";
  const [expanded, setExpanded] = useState<string | null>(null);

  const fundsQuery = useQuery({
    queryKey: ["operasional-sales-funds", ownerId],
    enabled: Boolean(ownerId && canAccess),
    queryFn: async () => {
      const { data, error } = await supabase.from("sales_travel_funds").select("id,sales_id,amount,note,given_at,transaction_type").order("given_at", { ascending: false }).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Fund[];
    },
  });

  const expensesQuery = useQuery({
    queryKey: ["operasional-sales-expenses", ownerId],
    enabled: Boolean(ownerId && canAccess),
    queryFn: async () => {
      const { data, error } = await supabase.from("sales_expenses").select("id,sales_id,category,amount,note,spent_at").order("spent_at", { ascending: false }).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Expense[];
    },
  });

  const teamQuery = useQuery({
    queryKey: ["operasional-sales-team", ownerId],
    enabled: Boolean(ownerId && canAccess),
    queryFn: () => fetchTeam({ data: { ownerId: isSuperAdmin ? ownerId : undefined } }),
  });

  const summaries = useMemo<Summary[]>(() => {
    const fundMap = new Map<string, { moneyIn: number; ownerReduction: number }>();
    for (const item of fundsQuery.data ?? []) {
      const row = fundMap.get(item.sales_id) ?? { moneyIn: 0, ownerReduction: 0 };
      if (item.transaction_type === "out") row.ownerReduction += Number(item.amount);
      else row.moneyIn += Number(item.amount);
      fundMap.set(item.sales_id, row);
    }
    const expenseMap = new Map<string, Expense[]>();
    for (const item of expensesQuery.data ?? []) {
      const list = expenseMap.get(item.sales_id) ?? [];
      list.push(item);
      expenseMap.set(item.sales_id, list);
    }
    const members = (teamQuery.data ?? []) as TeamMember[];
    return members.map((member) => {
      const funds = fundMap.get(member.user_id) ?? { moneyIn: 0, ownerReduction: 0 };
      const expenses = expenseMap.get(member.user_id) ?? [];
      const expense = expenses.reduce((sum, item) => sum + Number(item.amount), 0);
      const name = member.profiles?.display_name ?? member.profiles?.username ?? member.profiles?.user_email ?? "Sales";
      return { salesId: member.user_id, name, moneyIn: funds.moneyIn, expense, ownerReduction: funds.ownerReduction, balance: funds.moneyIn - expense - funds.ownerReduction, expenses };
    }).sort((a, b) => b.expense - a.expense || a.name.localeCompare(b.name));
  }, [fundsQuery.data, expensesQuery.data, teamQuery.data]);

  const totals = useMemo(() => summaries.reduce((acc, row) => ({ moneyIn: acc.moneyIn + row.moneyIn, expense: acc.expense + row.expense, ownerReduction: acc.ownerReduction + row.ownerReduction, balance: acc.balance + row.balance }), { moneyIn: 0, expense: 0, ownerReduction: 0, balance: 0 }), [summaries]);

  function downloadExcel() {
    const summaryRows = summaries.map((row) => ({ Sales: row.name, "Uang Masuk": row.moneyIn, "Pengeluaran": row.expense, "Pengurangan Owner": row.ownerReduction, Saldo: row.balance }));
    summaryRows.push({ Sales: "TOTAL", "Uang Masuk": totals.moneyIn, "Pengeluaran": totals.expense, "Pengurangan Owner": totals.ownerReduction, Saldo: totals.balance });
    const detailRows = summaries.flatMap((row) => row.expenses.map((expense) => ({ Tanggal: expense.spent_at, Sales: row.name, Kategori: expense.category, Keterangan: expense.note ?? "", Nominal: Number(expense.amount) })));
    const ledgerRows = (fundsQuery.data ?? []).map((fund) => ({ Tanggal: fund.given_at, Sales: summaries.find((row) => row.salesId === fund.sales_id)?.name ?? "Sales", Transaksi: fund.transaction_type === "in" ? "Uang Masuk" : "Pengurangan Owner", Keterangan: fund.note ?? "", Nominal: Number(fund.amount) }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryRows), "Ringkasan");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(detailRows), "Pengeluaran");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(ledgerRows), "Uang Jalan");
    XLSX.writeFile(workbook, `laporan-operasional-sales-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  if (profileLoading || adminLoading) return <main className="mx-auto max-w-md px-5 py-10 text-sm text-muted-foreground">Memuat...</main>;
  if (!canAccess) return <main className="mx-auto min-h-screen max-w-md px-5 pb-10 pt-6"><Link to="/dashboard" className="inline-flex items-center text-sm text-muted-foreground"><ArrowLeft className="mr-2 h-4 w-4" /> Kembali</Link><section className="mt-8 rounded-2xl border border-dashed p-6 text-center"><h1 className="font-semibold">Akses belum tersedia</h1><p className="mt-1 text-sm text-muted-foreground">Menu ini khusus Owner.</p></section></main>;

  const loading = fundsQuery.isLoading || expensesQuery.isLoading || teamQuery.isLoading;
  return <main className="mx-auto min-h-screen max-w-md px-5 pb-10 pt-6">
    <header><Link to="/dashboard" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="mr-2 h-4 w-4" /> Kembali</Link><div className="mt-5 flex items-center gap-2"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-orange-700"><Wallet className="h-5 w-5" /></div><div><div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Sales Pouch</div><h1 className="text-2xl font-bold">Operasional Sales</h1></div></div><p className="mt-1 text-sm text-muted-foreground">Ringkasan uang jalan, pengeluaran, dan saldo semua Sales.</p></header>

    <section className="mt-5 rounded-2xl border bg-card p-4 shadow-sm"><div className="grid grid-cols-2 gap-4"><div><div className="text-xs text-muted-foreground">Total Uang Masuk</div><div className="mt-1 font-bold">{rupiah(totals.moneyIn)}</div></div><div><div className="text-xs text-muted-foreground">Total Pengeluaran</div><div className="mt-1 font-bold">{rupiah(totals.expense)}</div></div><div><div className="text-xs text-muted-foreground">Pengurangan Owner</div><div className="mt-1 font-bold">{rupiah(totals.ownerReduction)}</div></div><div><div className="text-xs text-muted-foreground">Total Saldo</div><div className="mt-1 text-lg font-bold text-orange-700">{rupiah(totals.balance)}</div></div></div></section>

    <section className="mt-4"><div className="flex items-center justify-between gap-2"><div><h2 className="font-semibold">Saldo per Sales</h2><p className="text-xs text-muted-foreground">Diurutkan dari pengeluaran terbesar.</p></div><Button variant="outline" size="sm" onClick={downloadExcel} disabled={loading || summaries.length === 0}><FileSpreadsheet className="mr-1.5 h-4 w-4" /> Excel</Button></div>
      {loading ? <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div> : summaries.length === 0 ? <div className="mt-3 rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Belum ada Sales.</div> : <div className="mt-3 space-y-2">{summaries.map((row) => { const open = expanded === row.salesId; return <article key={row.salesId} className="overflow-hidden rounded-xl border bg-card"><button type="button" className="flex w-full items-center gap-3 p-4 text-left" onClick={() => setExpanded(open ? null : row.salesId)}><div className="min-w-0 flex-1"><div className="truncate font-semibold">{row.name}</div><div className="mt-1 text-xs text-muted-foreground">Masuk {rupiah(row.moneyIn)} · Keluar {rupiah(row.expense)}</div></div><div className="text-right"><div className="font-bold text-orange-700">{rupiah(row.balance)}</div><div className="text-[11px] text-muted-foreground">Saldo</div></div>{open ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}</button>{open && <div className="border-t bg-muted/20 p-4 text-sm"><div className="grid grid-cols-3 gap-2"><div><div className="text-[11px] text-muted-foreground">Uang Masuk</div><div className="font-semibold">{rupiah(row.moneyIn)}</div></div><div><div className="text-[11px] text-muted-foreground">Pengeluaran</div><div className="font-semibold">{rupiah(row.expense)}</div></div><div><div className="text-[11px] text-muted-foreground">Pengurangan</div><div className="font-semibold">{rupiah(row.ownerReduction)}</div></div></div><div className="mt-4 border-t pt-3"><div className="mb-2 font-semibold">Detail Pengeluaran</div>{row.expenses.length === 0 ? <p className="text-xs text-muted-foreground">Belum ada pengeluaran.</p> : <div className="space-y-2">{row.expenses.map((expense) => <div key={expense.id} className="flex items-center justify-between gap-3"><div className="min-w-0"><div className="truncate font-medium">{expense.category}</div><div className="text-[11px] text-muted-foreground">{expense.spent_at}{expense.note ? ` · ${expense.note}` : ""}</div></div><div className="shrink-0 font-semibold">{rupiah(Number(expense.amount))}</div></div>)}</div>}</div></div>}</article>; })}</div>}
    </section>

    <Button asChild variant="outline" className="mt-5 h-11 w-full rounded-lg"><Link to="/travel-funds"><Download className="mr-2 h-4 w-4" /> Kelola Uang Jalan</Link></Button>
  </main>;
}
