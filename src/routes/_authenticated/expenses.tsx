import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CalendarDays, Loader2, Plus, ReceiptText } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useProfile } from "@/hooks/use-profile";
import { isSuperAdminEmail } from "@/lib/access";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/expenses")({
  head: () => ({
    meta: [
      { title: "Pengeluaran Sales — Sales Pouch" },
      { name: "description", content: "Catat dan lihat pengeluaran operasional sales." },
    ],
  }),
  component: SalesExpenses,
});

const categories = ["Bensin", "Parkir", "Tol", "Tambal Ban", "Ganti Oli", "Lainnya"];

type Expense = {
  id: string;
  category: string;
  amount: number | string;
  note: string | null;
  spent_at: string;
  sales_id: string;
};

function formatRupiah(value: number | string) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function SalesExpenses() {
  const { data: profileData, isLoading: profileLoading } = useProfile();
  const queryClient = useQueryClient();
  const role = profileData?.role;
  const ownerId = profileData?.ownerId;
  const isSuperAdmin = isSuperAdminEmail(profileData?.email);
  const canInput = role === "sales" || isSuperAdmin;

  const [category, setCategory] = useState(categories[0]);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [spentAt, setSpentAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const expensesQuery = useQuery({
    queryKey: ["sales-expenses", ownerId, role],
    enabled: Boolean(ownerId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_expenses")
        .select("id,category,amount,note,spent_at,sales_id")
        .order("spent_at", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Expense[];
    },
  });

  const total = useMemo(
    () => (expensesQuery.data ?? []).reduce((sum, item) => sum + Number(item.amount), 0),
    [expensesQuery.data],
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0) {
      setErrorMessage("Nominal harus lebih dari 0.");
      return;
    }

    if (!profileData?.ownerId) {
      setErrorMessage("Profil belum siap. Coba lagi.");
      return;
    }

    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) {
      setErrorMessage("Sesi login tidak ditemukan.");
      setSaving(false);
      return;
    }

    const { error } = await supabase.from("sales_expenses").insert({
      owner_id: profileData.ownerId,
      sales_id: userId,
      category,
      amount: numericAmount,
      note: note.trim() || null,
      spent_at: spentAt,
    });

    setSaving(false);
    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setAmount("");
    setNote("");
    setSpentAt(new Date().toISOString().slice(0, 10));
    await queryClient.invalidateQueries({ queryKey: ["sales-expenses"] });
  }

  if (profileLoading) {
    return <main className="mx-auto max-w-md px-5 py-10 text-sm text-muted-foreground">Memuat...</main>;
  }

  return (
    <main className="mx-auto min-h-screen max-w-md px-5 pb-10 pt-6">
      <header>
        <Link to="/" className="mb-5 inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="mr-2 h-4 w-4" /> Kembali ke Beranda
        </Link>
        <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Sales Pouch</div>
        <h1 className="mt-1 text-2xl font-bold">Pengeluaran Sales</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {canInput ? "Catat biaya operasional. Untuk Sales, pengeluaran ini nantinya menjadi pengurang Uang Jalan." : "Lihat pengeluaran operasional semua Sales dalam usaha Anda."}
        </p>
      </header>

      {canInput && (
        <form onSubmit={handleSubmit} className="mt-6 space-y-4 rounded-2xl border p-4">
          <div className="flex items-center gap-2 font-semibold">
            <Plus className="h-4 w-4" /> Tambah Pengeluaran
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Keperluan</Label>
            <select id="category" value={category} onChange={(event) => setCategory(event.target.value)} className="flex h-10 w-full rounded-md border bg-background px-3 text-sm">
              {categories.map((item) => <option key={item}>{item}</option>)}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount">Nominal</Label>
            <Input id="amount" type="number" min="1" inputMode="numeric" placeholder="Contoh: 50000" value={amount} onChange={(event) => setAmount(event.target.value)} required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="spentAt">Tanggal</Label>
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input id="spentAt" type="date" className="pl-9" value={spentAt} onChange={(event) => setSpentAt(event.target.value)} required />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="note">Catatan <span className="font-normal text-muted-foreground">(opsional)</span></Label>
            <Textarea id="note" placeholder="Contoh: isi bensin sebelum keliling toko" value={note} onChange={(event) => setNote(event.target.value)} rows={3} />
          </div>

          {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}

          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ReceiptText className="mr-2 h-4 w-4" />}
            Simpan Pengeluaran
          </Button>
        </form>
      )}

      <section className="mt-6">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <h2 className="font-semibold">Riwayat Pengeluaran</h2>
            <p className="text-xs text-muted-foreground">Total tercatat: {formatRupiah(total)}</p>
          </div>
          {expensesQuery.isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>

        {expensesQuery.isError ? (
          <div className="rounded-xl border p-4 text-sm text-destructive">Gagal memuat pengeluaran. Coba lagi.</div>
        ) : (expensesQuery.data ?? []).length === 0 ? (
          <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Belum ada pengeluaran tercatat.</div>
        ) : (
          <div className="space-y-2">
            {(expensesQuery.data ?? []).map((expense) => (
              <article key={expense.id} className="rounded-xl border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{expense.category}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{new Date(`${expense.spent_at}T00:00:00`).toLocaleDateString("id-ID")}</div>
                    {expense.note && <div className="mt-2 text-sm text-muted-foreground">{expense.note}</div>}
                  </div>
                  <div className="shrink-0 font-semibold">{formatRupiah(expense.amount)}</div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
