import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Wallet, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { isSuperAdminEmail } from "@/lib/access";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/travel-funds")({
  head: () => ({ meta: [{ title: "Uang Jalan — Sales Pouch" }, { name: "description", content: "Uang jalan Sales dan pengurangan otomatis dari pengeluaran operasional." }] }),
  component: TravelFundsPage,
});

type Member = { user_id: string; profiles?: { display_name?: string | null; username?: string | null; user_email?: string | null } | null };
type Fund = { id: string; sales_id: string; amount: number; note: string | null; given_at: string; created_at: string };
type Expense = { sales_id: string; amount: number; category: string; spent_at: string };

function displayName(member?: Member | null) {
  return member?.profiles?.display_name ?? member?.profiles?.username ?? member?.profiles?.user_email ?? "Sales";
}

function rupiah(value: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

function TravelFundsPage() {
  const { data: profile, isLoading: profileLoading } = useProfile();
  const qc = useQueryClient();
  const ownerId = profile?.ownerId;
  const isAdmin = isSuperAdminEmail(profile?.email);
  const canManage = profile?.role === "owner" || isAdmin;
  const [salesId, setSalesId] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [givenAt, setGivenAt] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const { data: members = [], isLoading: membersLoading } = useQuery({
    queryKey: ["travel-fund-team", ownerId],
    enabled: !!ownerId && canManage,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_members")
        .select("user_id,profiles!team_members_user_id_fkey(display_name,username,user_email)")
        .eq("owner_id", ownerId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Member[];
    },
  });

  const { data: funds = [], isLoading: fundsLoading } = useQuery({
    queryKey: ["travel-funds", ownerId],
    enabled: !!ownerId,
    queryFn: async () => {
      const client = supabase as any;
      const { data, error } = await client
        .from("sales_travel_funds")
        .select("id,sales_id,amount,note,given_at,created_at")
        .eq("owner_id", ownerId)
        .order("given_at", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Fund[];
    },
  });

  const { data: expenses = [], isLoading: expensesLoading } = useQuery({
    queryKey: ["travel-fund-expenses", ownerId],
    enabled: !!ownerId,
    queryFn: async () => {
      const client = supabase as any;
      const { data, error } = await client
        .from("sales_expenses")
        .select("sales_id,amount,category,spent_at")
        .eq("owner_id", ownerId)
        .order("spent_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Expense[];
    },
  });

  const balances = useMemo(() => {
    const map = new Map<string, { in: number; out: number }>();
    for (const fund of funds) {
      const row = map.get(fund.sales_id) ?? { in: 0, out: 0 };
      row.in += Number(fund.amount);
      map.set(fund.sales_id, row);
    }
    for (const expense of expenses) {
      const row = map.get(expense.sales_id) ?? { in: 0, out: 0 };
      row.out += Number(expense.amount);
      map.set(expense.sales_id, row);
    }
    return map;
  }, [funds, expenses]);

  const selectedMember = members.find((m) => m.user_id === salesId);
  const ownBalance = profile?.id ? balances.get(profile.id) : undefined;
  const totalIn = funds.reduce((sum, item) => sum + Number(item.amount), 0);
  const totalOut = expenses.reduce((sum, item) => sum + Number(item.amount), 0);
  const isLoading = profileLoading || fundsLoading || expensesLoading;

  async function addFund(e: React.FormEvent) {
    e.preventDefault();
    const numericAmount = Number(amount.replace(/[^0-9]/g, ""));
    if (!ownerId || !salesId || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      toast.error("Pilih Sales dan isi nominal Uang Masuk.");
      return;
    }
    setSaving(true);
    try {
      const client = supabase as any;
      const { error } = await client.from("sales_travel_funds").insert({
        owner_id: ownerId,
        sales_id: salesId,
        amount: numericAmount,
        note: note.trim() || null,
        given_at: givenAt,
      });
      if (error) throw error;
      setAmount("");
      setNote("");
      toast.success(`Uang jalan ${rupiah(numericAmount)} diberikan ke ${displayName(selectedMember)}`);
      qc.invalidateQueries({ queryKey: ["travel-funds", ownerId] });
    } catch (error) {
      toast.error((error as Error).message || "Uang jalan gagal disimpan.");
    } finally {
      setSaving(false);
    }
  }

  if (profileLoading) return <main className="mx-auto max-w-md px-5 py-10 text-sm text-muted-foreground">Memuat...</main>;

  return (
    <main className="mx-auto min-h-screen max-w-md px-5 pb-10 pt-6">
      <a href="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" />Kembali</a>
      <header className="mt-4">
        <div className="flex items-center gap-2"><Wallet className="h-5 w-5" /><h1 className="text-2xl font-bold">Uang Jalan</h1></div>
        <p className="mt-1 text-sm text-muted-foreground">Owner memberi uang jalan. Pengeluaran Sales otomatis menguranginya.</p>
      </header>

      {canManage && (
        <form onSubmit={addFund} className="mt-6 space-y-3 rounded-2xl border bg-card p-4">
          <h2 className="font-semibold">Uang Masuk</h2>
          <select required value={salesId} onChange={(e) => setSalesId(e.target.value)} className="h-11 w-full rounded-md border bg-background px-3 text-sm">
            <option value="">Pilih Sales</option>
            {members.map((member) => <option key={member.user_id} value={member.user_id}>{displayName(member)}</option>)}
          </select>
          <Input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Nominal, contoh 500000" className="h-11" />
          <Input type="date" value={givenAt} onChange={(e) => setGivenAt(e.target.value)} className="h-11" />
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Catatan (opsional)" className="h-11" />
          <Button disabled={saving || membersLoading} className="h-11 w-full"><Plus className="mr-2 h-4 w-4" />{saving ? "Menyimpan..." : "Tambah Uang Jalan"}</Button>
        </form>
      )}

      {!canManage && ownBalance && (
        <section className="mt-6 rounded-2xl border bg-card p-5">
          <div className="text-sm text-muted-foreground">Sisa Uang Jalan</div>
          <div className="mt-1 text-3xl font-bold">{rupiah(ownBalance.in - ownBalance.out)}</div>
          <div className="mt-3 text-xs text-muted-foreground">Masuk {rupiah(ownBalance.in)} · Pengeluaran {rupiah(ownBalance.out)}</div>
        </section>
      )}

      {canManage && (
        <section className="mt-6 rounded-2xl border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div><h2 className="font-semibold">Rekap</h2><p className="text-xs text-muted-foreground">Seluruh Sales</p></div>
            <div className="text-right text-sm"><div>Masuk: <b>{rupiah(totalIn)}</b></div><div>Keluar: <b>{rupiah(totalOut)}</b></div><div>Sisa: <b>{rupiah(totalIn - totalOut)}</b></div></div>
          </div>
          <div className="mt-4 space-y-2">
            {members.map((member) => {
              const row = balances.get(member.user_id) ?? { in: 0, out: 0 };
              return <div key={member.user_id} className="rounded-xl border p-3"><div className="font-semibold">{displayName(member)}</div><div className="mt-1 text-xs text-muted-foreground">Masuk {rupiah(row.in)} · Pengeluaran {rupiah(row.out)}</div><div className="mt-1 text-lg font-bold">Sisa {rupiah(row.in - row.out)}</div></div>;
            })}
            {members.length === 0 && <p className="text-sm text-muted-foreground">Belum ada Sales.</p>}
          </div>
        </section>
      )}

      <section className="mt-6">
        <h2 className="font-semibold">Riwayat Uang Masuk</h2>
        <div className="mt-3 space-y-2">
          {funds.map((fund) => <div key={fund.id} className="rounded-xl border bg-card p-3"><div className="flex items-start justify-between gap-3"><div><div className="font-semibold">{members.find((m) => m.user_id === fund.sales_id) ? displayName(members.find((m) => m.user_id === fund.sales_id)) : "Sales"}</div><div className="mt-1 text-xs text-muted-foreground">{new Date(`${fund.given_at}T00:00:00`).toLocaleDateString("id-ID", { dateStyle: "medium" })}{fund.note ? ` · ${fund.note}` : ""}</div></div><div className="font-semibold">+{rupiah(Number(fund.amount))}</div></div></div>)}
          {!isLoading && funds.length === 0 && <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">Belum ada Uang Masuk.</div>}
        </div>
      </section>
    </main>
  );
}
