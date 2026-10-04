import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CalendarDays, ChevronDown, ChevronUp, Loader2, Plus, ReceiptText } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useProfile } from "@/hooks/use-profile";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { isSuperAdminEmail } from "@/lib/access";
import { listTeam } from "@/lib/team.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/expenses")({
  head: () => ({ meta: [{ title: "Pengeluaran Sales — Sales Pouch" }, { name: "description", content: "Catat dan lihat laporan pengeluaran operasional sales." }] }),
  component: SalesExpenses,
});

type Expense = { id: string; category: string; amount: number | string; note: string | null; spent_at: string; sales_id: string };
type TeamMember = { user_id: string; profiles?: { user_email?: string; username?: string; display_name?: string } | null };

function formatRupiah(value: number | string) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value));
}

function SalesExpenses() {
  const { data: profileData, isLoading: profileLoading } = useProfile();
  const { data: isAdmin, isLoading: adminLoading } = useIsAdmin();
  const queryClient = useQueryClient();
  const fetchTeam = useServerFn(listTeam);
  const role = profileData?.role;
  const userId = profileData?.profile?.id;
  const ownerId = profileData?.ownerId;
  const isSuperAdmin = isSuperAdminEmail(profileData?.email) || !!isAdmin;
  const isOwner = role === "owner";
  const canAccess = isSuperAdmin || isOwner || role === "sales";
  const canInput = isSuperAdmin || role === "sales";
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [spentAt, setSpentAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [newCategory, setNewCategory] = useState("");
  const [localCategories, setLocalCategories] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [addingCategory, setAddingCategory] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [expandedSales, setExpandedSales] = useState<string | null>(null);

  const expensesQuery = useQuery({
    queryKey: ["sales-expenses", ownerId, role],
    enabled: Boolean(ownerId && canAccess),
    queryFn: async () => {
      const { data, error } = await supabase.from("sales_expenses").select("id,category,amount,note,spent_at,sales_id").order("spent_at", { ascending: false }).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Expense[];
    },
  });

  const teamQuery = useQuery({
    queryKey: ["expense-team", ownerId],
    enabled: Boolean(isOwner && ownerId && !isAdmin),
    queryFn: () => fetchTeam({ data: { ownerId: undefined } }),
  });

  const superAdminTeamQuery = useQuery({
    queryKey: ["expense-team-admin", ownerId],
    enabled: Boolean(isSuperAdmin && ownerId),
    queryFn: () => fetchTeam({ data: { ownerId } }),
  });

  const teamMembers = (isOwner && !isAdmin ? teamQuery.data : superAdminTeamQuery.data) as TeamMember[] | undefined;

  const salesNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const member of teamMembers ?? []) {
      const p = member.profiles;
      map.set(member.user_id, p?.display_name ?? p?.username ?? p?.user_email ?? "Sales");
    }
    return map;
  }, [teamMembers]);

  const savedCategories = useMemo(() => {
    const seen = new Set<string>();
    return (expensesQuery.data ?? [])
      .filter((item) => item.sales_id === userId || canInput)
      .map((item) => item.category.trim())
      .filter((name) => name && !seen.has(name) && seen.add(name));
  }, [expensesQuery.data, userId, canInput]);

  const categories = useMemo(() => {
    const seen = new Set<string>();
    return [...localCategories, ...savedCategories].filter((name) => name && !seen.has(name) && seen.add(name));
  }, [localCategories, savedCategories]);

  useEffect(() => {
    if (!category && categories.length) setCategory(categories[0]);
  }, [categories, category]);

  const total = useMemo(() => (expensesQuery.data ?? []).reduce((sum, item) => sum + Number(item.amount), 0), [expensesQuery.data]);

  const salesReport = useMemo(() => {
    const grouped = new Map<string, Expense[]>();
    for (const expense of expensesQuery.data ?? []) {
      const list = grouped.get(expense.sales_id) ?? [];
      list.push(expense);
      grouped.set(expense.sales_id, list);
    }

    for (const member of teamMembers ?? []) {
      if (!grouped.has(member.user_id)) grouped.set(member.user_id, []);
    }

    return [...grouped.entries()]
      .map(([salesId, expenses]) => ({
        salesId,
        name: salesNames.get(salesId) ?? (salesId === userId ? "Anda" : "Sales"),
        expenses,
        total: expenses.reduce((sum, item) => sum + Number(item.amount), 0),
      }))
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  }, [expensesQuery.data, teamMembers, salesNames, userId]);

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

  if (profileLoading || adminLoading) return <main className="mx-auto max-w-md px-5 py-10 text-sm text-muted-foreground">Memuat...</main>;

  if (!canAccess) {
    return (
      <main className="mx-auto min-h-screen max-w-md px-5 pb-10 pt-6">
        <header>
          <Link to="/" className="mb-5 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="mr-2 h-4 w-4" /> Kembali ke Beranda</Link>
          <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Sales Pouch</div>
          <h1 className="mt-1 text-2xl font-bold">Pengeluaran Sales</h1>
        </header>
        <section className="mt-8 rounded-2xl border border-dashed p-6 text-center">
          <h2 className="font-semibold">Akses belum tersedia</h2>
          <p className="mt-1 text-sm text-muted-foreground">Menu ini hanya tersedia untuk Owner dan Sales.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-md px-5 pb-10 pt-6">
      <header>
        <Link to="/" className="mb-5 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="mr-2 h-4 w-4" /> Kembali ke Beranda</Link>
        <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Sales Pouch</div>
        <h1 className="mt-1 text-2xl font-bold">Pengeluaran Sales</h1>
        <p className="mt-1 text-sm text-muted-foreground">{canInput ? "Catat biaya operasional sesuai kebutuhan Anda." : "Laporan pengeluaran Sales berdasarkan total terbesar."}</p>
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
          <p className="text-xs text-muted-foreground">Ketik keperluan baru lalu tekan Tambah. Tombolnya langsung muncul di atas.</p>
        </div>
        <div className="space-y-2"><Label htmlFor="amount">Nominal</Label><Input id="amount" type="number" min="1" inputMode="numeric" placeholder="Contoh: 50000" value={amount} onChange={(e) => setAmount(e.target.value)} required /></div>
        <div className="space-y-2"><Label htmlFor="spentAt">Tanggal</Label><div className="relative"><CalendarDays className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input id="spentAt" type="date" className="pl-9" value={spentAt} onChange={(e) => setSpentAt(e.target.value)} required /></div></div>
        <div className="space-y-2"><Label htmlFor="note">Catatan <span className="font-normal text-muted-foreground">(opsional)</span></Label><Textarea id="note" placeholder="Contoh: makan siang saat keliling toko" value={note} onChange={(e) => setNote(e.target.value)} rows={3} /></div>
        {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
        <Button type="submit" className="w-full" disabled={saving || !category}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ReceiptText className="mr-2 h-4 w-4" />}Simpan Pengeluaran</Button>
      </form>}

      {isOwner || isSuperAdmin ? (
        <section className="mt-6">
          <div className="mb-3 flex items-end justify-between">
            <div><h2 className="font-semibold">Laporan Pengeluaran Sales</h2><p className="text-xs text-muted-foreground">Diurutkan dari pengeluaran terbesar</p></div>
            {expensesQuery.isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
          {expensesQuery.isError ? <div className="rounded-xl border p-4 text-sm text-destructive">Gagal memuat pengeluaran. Coba lagi.</div> : salesReport.length === 0 ? <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Belum ada Sales atau pengeluaran tercatat.</div> : <div className="space-y-2">
            {salesReport.map((sales, index) => {
              const expanded = expandedSales === sales.salesId;
              return <article key={sales.salesId} className="overflow-hidden rounded-xl border bg-card">
                <button type="button" onClick={() => setExpandedSales(expanded ? null : sales.salesId)} className="flex w-full items-center gap-3 p-4 text-left">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-bold">{index + 1}</div>
                  <div className="min-w-0 flex-1"><div className="truncate font-semibold">{sales.name}</div><div className="text-xs text-muted-foreground">{sales.expenses.length} transaksi pengeluaran</div></div>
                  <div className="text-right"><div className="font-bold">{formatRupiah(sales.total)}</div><div className="text-[11px] text-muted-foreground">Total</div></div>
                  {expanded ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
                </button>
                {expanded && <div className="border-t bg-muted/20 px-4 pb-3">
                  {sales.expenses.length === 0 ? <p className="py-3 text-sm text-muted-foreground">Belum ada pengeluaran.</p> : sales.expenses.map((expense) => <div key={expense.id} className="flex items-start justify-between gap-3 border-b py-3 last:border-b-0"><div><div className="text-sm font-medium">{expense.category}</div><div className="text-xs text-muted-foreground">{new Date(`${expense.spent_at}T00:00:00`).toLocaleDateString("id-ID")}{expense.note ? ` • ${expense.note}` : ""}</div></div><div className="shrink-0 text-sm font-semibold">{formatRupiah(expense.amount)}</div></div>)}
                </div>}
              </article>;
            })}
          </div>}
          <div className="mt-4 rounded-xl bg-muted/40 p-4"><div className="flex items-center justify-between"><span className="text-sm font-medium">Total Semua Sales</span><span className="font-bold">{formatRupiah(total)}</span></div></div>
        </section>
      ) : (
        <section className="mt-6">
          <div className="mb-3 flex items-end justify-between"><div><h2 className="font-semibold">Riwayat Pengeluaran</h2><p className="text-xs text-muted-foreground">Total tercatat: {formatRupiah(total)}</p></div>{expensesQuery.isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}</div>
          {expensesQuery.isError ? <div className="rounded-xl border p-4 text-sm text-destructive">Gagal memuat pengeluaran. Coba lagi.</div> : (expensesQuery.data ?? []).length === 0 ? <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Belum ada pengeluaran tercatat.</div> : <div className="space-y-2">{(expensesQuery.data ?? []).map((expense) => <article key={expense.id} className="rounded-xl border p-3"><div className="flex items-start justify-between gap-3"><div><div className="font-medium">{expense.category}</div><div className="mt-0.5 text-xs text-muted-foreground">{new Date(`${expense.spent_at}T00:00:00`).toLocaleDateString("id-ID")}</div>{expense.note && <div className="mt-2 text-sm text-muted-foreground">{expense.note}</div>}</div><div className="shrink-0 font-semibold">{formatRupiah(expense.amount)}</div></div></article>)}</div>}
        </section>
      )}
    </main>
  );
}
