import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CalendarDays, Loader2, Plus, ReceiptText } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useProfile } from "@/hooks/use-profile";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/expenses")({
  head: () => ({ meta: [{ title: "Pengeluaran Sales — Sales Pouch" }, { name: "description", content: "Catat pengeluaran operasional sales." }] }),
  component: SalesExpenses,
});

type Expense = { id: string; category: string; amount: number | string; note: string | null; spent_at: string; sales_id: string };

function formatRupiah(value: number | string) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value));
}

function SalesExpenses() {
  const { data: profileData, isLoading: profileLoading } = useProfile();
  const queryClient = useQueryClient();
  const role = profileData?.role;
  const userId = profileData?.profile?.id;
  const ownerId = profileData?.ownerId;
  const canAccess = role === "owner" || role === "sales";
  const canInput = role === "sales";
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [spentAt, setSpentAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [newCategory, setNewCategory] = useState("");
  const [localCategories, setLocalCategories] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [addingCategory, setAddingCategory] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const expensesQuery = useQuery({
    queryKey: ["sales-expenses", ownerId, role, userId],
    enabled: Boolean(ownerId && canAccess),
    queryFn: async () => {
      const { data, error } = await supabase.from("sales_expenses").select("id,category,amount,note,spent_at,sales_id").order("spent_at", { ascending: false }).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Expense[];
    },
  });

  const savedCategories = useMemo(() => {
    const seen = new Set<string>();
    return (expensesQuery.data ?? [])
      .map((item) => item.category.trim())
      .filter((name) => name && !seen.has(name) && seen.add(name));
  }, [expensesQuery.data]);

  const categories = useMemo(() => {
    const seen = new Set<string>();
    return [...localCategories, ...savedCategories].filter((name) => name && !seen.has(name) && seen.add(name));
  }, [localCategories, savedCategories]);

  useEffect(() => {
    if (!category && categories.length) setCategory(categories[0]);
  }, [categories, category]);

  const total = useMemo(() => (expensesQuery.data ?? []).reduce((sum, item) => sum + Number(item.amount), 0), [expensesQuery.data]);

  function handleAddCategory() {
    const name = newCategory.trim();
    if (!name || addingCategory) return;
    setErrorMessage("");
    setAddingCategory(true);
    const existing = categories.find((item) => item.toLowerCase() === name.toLowerCase());
    const selectedName = existing ?? name;
    if (!existing) setLocalCategories((current) => [...current, name]);
    setCategory(selectedName);
    setNewCategory("");
    setAddingCategory(false);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    const numericAmount = Number(amount);
    if (!category.trim()) return setErrorMessage("Pilih atau tambahkan keperluan terlebih dahulu.");
    if (!numericAmount || numericAmount <= 0) return setErrorMessage("Nominal harus lebih dari 0.");
    if (!profileData?.ownerId || !userId) return setErrorMessage("Profil belum siap. Coba lagi.");
    setSaving(true);
    const { error } = await supabase.from("sales_expenses").insert({ owner_id: profileData.ownerId, sales_id: userId, category: category.trim(), amount: numericAmount, note: note.trim() || null, spent_at: spentAt });
    setSaving(false);
    if (error) return setErrorMessage(error.message);
    setAmount(""); setNote(""); setSpentAt(new Date().toISOString().slice(0, 10));
    await queryClient.invalidateQueries({ queryKey: ["sales-expenses"] });
  }

  if (profileLoading) return <main className="mx-auto max-w-md px-5 py-10 text-sm text-muted-foreground">Memuat...</main>;

  if (!canAccess) {
    return (
      <main className="mx-auto min-h-screen max-w-md px-5 pb-10 pt-6">
        <header>
          <Link to="/" className="mb-5 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="mr-2 h-4 w-4" /> Kembali ke Beranda</Link>
          <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Sales Pouch</div>
          <h1 className="mt-1 text-2xl font-bold">Pengeluaran Sales</h1>
        </header>
        <section className="mt-8 rounded-2xl border border-dashed p-6 text-center">
          <h2 className="mt-3 font-semibold">Fitur tidak tersedia untuk akun ini</h2>
          <p className="mt-1 text-sm text-muted-foreground">Pengeluaran Sales tersedia untuk Owner dan Sales.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-md px-5 pb-10 pt-6">
      <header>
        <Link to="/notes" className="mb-5 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="mr-2 h-4 w-4" /> Kembali ke Catatan</Link>
        <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Sales Pouch</div>
        <h1 className="mt-1 text-2xl font-bold">Pengeluaran Sales</h1>
        <p className="mt-1 text-sm text-muted-foreground">{canInput ? "Catat biaya operasional yang Anda keluarkan." : "Lihat seluruh pengeluaran operasional Sales."}</p>
      </header>

      {canInput && <form onSubmit={handleSubmit} className="mt-6 space-y-4 rounded-2xl border p-4">
        <div className="flex items-center gap-2 font-semibold"><Plus className="h-4 w-4" /> Tambah Pengeluaran</div>
        <div className="space-y-2">
          <Label>Keperluan</Label>
          <div className="flex flex-wrap gap-2">
            {categories.map((item) => <button key={item} type="button" onClick={() => setCategory(item)} className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${category === item ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}>{item}</button>)}
          </div>
          <div className="flex gap-2">
            <Input id="new-expense-category" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="Kategori baru, misalnya Pulsa" className="mt-2" />
            <Button type="button" variant="outline" className="mt-2 shrink-0" onClick={handleAddCategory} disabled={!newCategory.trim() || addingCategory}>{addingCategory ? <Loader2 className="h-4 w-4 animate-spin" /> : "Tambah"}</Button>
          </div>
          <p className="text-xs text-muted-foreground">Ketik keperluan baru lalu tekan Tambah. Kategori akan tersimpan saat pengeluaran disimpan.</p>
        </div>
        <div className="space-y-2"><Label htmlFor="amount">Nominal</Label><Input id="amount" type="number" min="1" inputMode="numeric" placeholder="Contoh: 50000" value={amount} onChange={(e) => setAmount(e.target.value)} required /></div>
        <div className="space-y-2"><Label htmlFor="spentAt">Tanggal</Label><div className="relative"><CalendarDays className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input id="spentAt" type="date" className="pl-9" value={spentAt} onChange={(e) => setSpentAt(e.target.value)} required /></div></div>
        <div className="space-y-2"><Label htmlFor="note">Catatan <span className="font-normal text-muted-foreground">(opsional)</span></Label><Textarea id="note" placeholder="Contoh: makan siang saat keliling toko" value={note} onChange={(e) => setNote(e.target.value)} rows={3} /></div>
        {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
        <Button type="submit" className="w-full" disabled={saving || !category}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ReceiptText className="mr-2 h-4 w-4" />}Simpan Pengeluaran</Button>
      </form>}

      <section className="mt-6">
        <div className="mb-3 flex items-end justify-between"><div><h2 className="font-semibold">Riwayat Pengeluaran</h2><p className="text-xs text-muted-foreground">Total tercatat: {formatRupiah(total)}</p></div>{expensesQuery.isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}</div>
        {expensesQuery.isError ? <div className="rounded-xl border p-4 text-sm text-destructive">Gagal memuat pengeluaran. Coba lagi.</div> : (expensesQuery.data ?? []).length === 0 ? <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Belum ada pengeluaran tercatat.</div> : <div className="space-y-2">{(expensesQuery.data ?? []).map((expense) => <article key={expense.id} className="rounded-xl border p-3"><div className="flex items-start justify-between gap-3"><div><div className="font-medium">{expense.category}</div><div className="mt-0.5 text-xs text-muted-foreground">{new Date(`${expense.spent_at}T00:00:00`).toLocaleDateString("id-ID")}</div>{expense.note && <div className="mt-2 text-sm text-muted-foreground">{expense.note}</div>}</div><div className="shrink-0 font-semibold">{formatRupiah(expense.amount)}</div></div></article>)}</div>}
      </section>
    </main>
  );
}
