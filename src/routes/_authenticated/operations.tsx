import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Download, Wallet, ReceiptText, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/operations")({
  head: () => ({ meta: [{ title: "Operasional — Sales Pouch" }, { name: "description", content: "Ringkasan uang jalan dan pengeluaran operasional Sales." }] }),
  component: OperationsPage,
});

type Member = { user_id: string; profiles?: { display_name?: string | null; username?: string | null; user_email?: string | null } | null };
type Fund = { sales_id: string; amount: number; transaction_type: "in" | "out" };
type Expense = { sales_id: string; amount: number; category: string; spent_at: string; note: string | null };

function nameOf(member?: Member) {
  return member?.profiles?.display_name ?? member?.profiles?.username ?? member?.profiles?.user_email ?? "Sales";
}
function rupiah(value: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

function OperationsPage() {
  const { data: profile } = useProfile();
  const { data: isAdmin } = useIsAdmin();
  const ownerId = profile?.ownerId;
  const canManage = !!isAdmin || profile?.role === "owner";

  const { data: members = [] } = useQuery({
    queryKey: ["operations-team", ownerId],
    enabled: !!ownerId && canManage,
    queryFn: async () => {
      const { data, error } = await supabase.from("team_members").select("user_id,profiles!team_members_user_id_fkey(display_name,username,user_email)").eq("owner_id", ownerId ?? "").order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Member[];
    },
  });

  const { data: funds = [], isLoading: fundsLoading } = useQuery({
    queryKey: ["operations-funds", ownerId],
    enabled: !!ownerId && canManage,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("sales_travel_funds").select("sales_id,amount,transaction_type").eq("owner_id", ownerId);
      if (error) throw error;
      return (data ?? []) as Fund[];
    },
  });

  const { data: expenses = [], isLoading: expensesLoading } = useQuery({
    queryKey: ["operations-expenses", ownerId],
    enabled: !!ownerId && canManage,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("sales_expenses").select("sales_id,amount,category,spent_at,note").eq("owner_id", ownerId).order("spent_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Expense[];
    },
  });

  const rows = useMemo(() => members.map((member) => {
    const incoming = funds.filter((f) => f.sales_id === member.user_id && f.transaction_type !== "out").reduce((s, f) => s + Number(f.amount), 0);
    const ownerOut = funds.filter((f) => f.sales_id === member.user_id && f.transaction_type === "out").reduce((s, f) => s + Number(f.amount), 0);
    const expenseOut = expenses.filter((e) => e.sales_id === member.user_id).reduce((s, e) => s + Number(e.amount), 0);
    return { member, incoming, ownerOut, expenseOut, spent: ownerOut + expenseOut, balance: incoming - ownerOut - expenseOut };
  }).sort((a, b) => b.spent - a.spent), [members, funds, expenses]);

  const totalIn = rows.reduce((s, r) => s + r.incoming, 0);
  const totalExpense = rows.reduce((s, r) => s + r.expenseOut, 0);
  const totalOwnerOut = rows.reduce((s, r) => s + r.ownerOut, 0);
  const totalBalance = totalIn - totalExpense - totalOwnerOut;

  async function downloadExcel() {
    try {
      const XLSX = await import("xlsx");
      const summary = rows.map((r) => ({ Sales: nameOf(r.member), "Uang Masuk": r.incoming, "Pengeluaran": r.expenseOut, "Pengurangan Owner": r.ownerOut, Sisa: r.balance }));
      const detail = expenses.map((e) => ({ Tanggal: e.spent_at, Sales: nameOf(members.find((m) => m.user_id === e.sales_id)), Kategori: e.category, Keterangan: e.note ?? "", Nominal: Number(e.amount) }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), "Ringkasan");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detail), "Pengeluaran");
      XLSX.writeFile(wb, `operasional-sales-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success("Excel berhasil dibuat.");
    } catch (error) {
      toast.error((error as Error).message || "Gagal membuat Excel.");
    }
  }

  if (!canManage) return <main className="mx-auto max-w-md px-5 py-10 text-sm text-muted-foreground">Halaman ini khusus Owner.</main>;

  return (
    <main className="mx-auto min-h-screen max-w-md px-5 pb-10 pt-6">
      <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" />Kembali</Link>
      <header className="mt-4"><div className="flex items-center gap-2"><Wallet className="h-5 w-5 text-orange-700" /><h1 className="text-2xl font-bold">Operasional</h1></div><p className="mt-1 text-sm text-muted-foreground">Uang jalan, pengeluaran, saldo, dan laporan Sales.</p></header>

      <section className="mt-5 grid grid-cols-3 gap-2">
        <div className="rounded-xl border bg-card p-3"><div className="text-[11px] text-muted-foreground">Masuk</div><div className="mt-1 text-sm font-bold">{rupiah(totalIn)}</div></div>
        <div className="rounded-xl border bg-card p-3"><div className="text-[11px] text-muted-foreground">Keluar</div><div className="mt-1 text-sm font-bold">{rupiah(totalExpense + totalOwnerOut)}</div></div>
        <div className="rounded-xl border bg-card p-3"><div className="text-[11px] text-muted-foreground">Sisa</div><div className="mt-1 text-sm font-bold">{rupiah(totalBalance)}</div></div>
      </section>

      <section className="mt-4 grid grid-cols-2 gap-2">
        <Button asChild variant="outline" className="h-12 rounded-lg justify-start"><Link to="/expenses"><ReceiptText className="mr-2 h-4 w-4" />Transaksi</Link></Button>
        <Button asChild variant="outline" className="h-12 rounded-lg justify-start"><Link to="/reports"><BarChart3 className="mr-2 h-4 w-4" />Laporan</Link></Button>
        <Button type="button" variant="outline" className="h-12 rounded-lg justify-start" onClick={downloadExcel}><Download className="mr-2 h-4 w-4" />Download Excel</Button>
      </section>

      <section className="mt-6">
        <div className="mb-2 flex items-center justify-between"><h2 className="font-semibold">Rekap Sales</h2><span className="text-xs text-muted-foreground">Pengeluaran tertinggi di atas</span></div>
        <div className="space-y-2">
          {rows.map((r) => <div key={r.member.user_id} className="rounded-xl border bg-card p-3"><div className="flex items-center justify-between gap-3"><div className="font-semibold">{nameOf(r.member)}</div><div className="text-base font-bold">{rupiah(r.balance)}</div></div><div className="mt-2 grid grid-cols-3 gap-2 text-xs text-muted-foreground"><span>Masuk<br /><b className="text-foreground">{rupiah(r.incoming)}</b></span><span>Keluar<br /><b className="text-foreground">{rupiah(r.spent)}</b></span><span>Expense<br /><b className="text-foreground">{rupiah(r.expenseOut)}</b></span></div></div>)}
          {!fundsLoading && !expensesLoading && rows.length === 0 && <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Belum ada Sales.</div>}
        </div>
      </section>
    </main>
  );
}
