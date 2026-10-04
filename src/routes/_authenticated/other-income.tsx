import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowUpCircle, CalendarDays, Loader2, Plus, Trash2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useProfile } from "@/hooks/use-profile";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/other-income")({
  head: () => ({ meta: [{ title: "Pemasukan Lain — Sales Pouch" }, { name: "description", content: "Catatan pemasukan pribadi." }] }),
  component: OtherIncome,
});

type Income = { id: string; category: string; amount: number | string; note: string | null; received_at: string };

const rupiah = (value: number | string) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value));

function OtherIncome() {
  const { data: profileData, isLoading } = useProfile();
  const queryClient = useQueryClient();
  const userId = profileData?.profile?.id;
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [receivedAt, setReceivedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const query = useQuery({
    queryKey: ["personal-other-income", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase.from("personal_other_income").select("id,category,amount,note,received_at").order("received_at", { ascending: false }).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Income[];
    },
  });

  const total = useMemo(() => (query.data ?? []).reduce((sum, item) => sum + Number(item.amount), 0), [query.data]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    const numericAmount = Number(amount);
    if (!userId) return setErrorMessage("Profil belum siap. Coba lagi.");
    if (!category.trim()) return setErrorMessage("Isi sumber pemasukan terlebih dahulu.");
    if (!numericAmount || numericAmount <= 0) return setErrorMessage("Nominal harus lebih dari 0.");
    setSaving(true);
    const { error } = await supabase.from("personal_other_income").insert({ account_id: userId, category: category.trim(), amount: numericAmount, note: note.trim() || null, received_at: receivedAt });
    setSaving(false);
    if (error) return setErrorMessage(error.message);
    setCategory(""); setAmount(""); setNote(""); setReceivedAt(new Date().toISOString().slice(0, 10));
    await queryClient.invalidateQueries({ queryKey: ["personal-other-income"] });
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    const { error } = await supabase.from("personal_other_income").delete().eq("id", id);
    setDeleting(null);
    if (error) return setErrorMessage(error.message);
    await queryClient.invalidateQueries({ queryKey: ["personal-other-income"] });
  }

  if (isLoading) return <main className="mx-auto max-w-md px-5 py-10 text-sm text-muted-foreground">Memuat...</main>;

  return (
    <main className="mx-auto min-h-screen max-w-md px-5 pb-10 pt-6">
      <header>
        <Link to="/notes" className="mb-5 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="mr-2 h-4 w-4" /> Kembali ke Catatan</Link>
        <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Catatan Pribadi</div>
        <h1 className="mt-1 text-2xl font-bold">Pemasukan Lain</h1>
        <p className="mt-1 text-sm text-muted-foreground">Bonus, komisi, atau pemasukan lain yang ingin Anda catat. Tidak tersinkron ke data usaha.</p>
      </header>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4 rounded-2xl border p-4">
        <div className="flex items-center gap-2 font-semibold"><Plus className="h-4 w-4" /> Tambah Pemasukan</div>
        <div className="space-y-2"><Label htmlFor="category">Sumber / Keterangan</Label><Input id="category" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Contoh: Bonus, komisi" required /></div>
        <div className="space-y-2"><Label htmlFor="amount">Nominal</Label><Input id="amount" type="number" min="1" inputMode="numeric" placeholder="Contoh: 500000" value={amount} onChange={(e) => setAmount(e.target.value)} required /></div>
        <div className="space-y-2"><Label htmlFor="receivedAt">Tanggal</Label><div className="relative"><CalendarDays className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input id="receivedAt" type="date" className="pl-9" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} required /></div></div>
        <div className="space-y-2"><Label htmlFor="note">Catatan <span className="font-normal text-muted-foreground">(opsional)</span></Label><Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Catatan tambahan" rows={3} /></div>
        {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
        <Button type="submit" className="w-full" disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowUpCircle className="mr-2 h-4 w-4" />}Simpan Pemasukan</Button>
      </form>

      <section className="mt-6"><div className="mb-3"><h2 className="font-semibold">Riwayat Pemasukan</h2><p className="text-xs text-muted-foreground">Total catatan: {rupiah(total)}</p></div>
        {query.isError ? <div className="rounded-xl border p-4 text-sm text-destructive">Gagal memuat catatan.</div> : (query.data ?? []).length === 0 ? <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Belum ada pemasukan tercatat.</div> : <div className="space-y-2">{(query.data ?? []).map((item) => <article key={item.id} className="rounded-xl border p-3"><div className="flex items-start justify-between gap-3"><div><div className="font-medium">{item.category}</div><div className="mt-0.5 text-xs text-muted-foreground">{new Date(`${item.received_at}T00:00:00`).toLocaleDateString("id-ID")}</div>{item.note && <div className="mt-2 text-sm text-muted-foreground">{item.note}</div>}</div><div className="flex shrink-0 flex-col items-end gap-2"><div className="font-semibold">{rupiah(item.amount)}</div><Button type="button" variant="ghost" size="icon" aria-label="Hapus pemasukan" onClick={() => handleDelete(item.id)} disabled={deleting === item.id}>{deleting === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}</Button></div></div></article>)}</div>}
      </section>
    </main>
  );
}
