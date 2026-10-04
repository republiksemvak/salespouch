import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Bell, CalendarDays, Loader2, Plus, Trash2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useProfile } from "@/hooks/use-profile";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/reminders")({
  head: () => ({ meta: [{ title: "Pengingat — Sales Pouch" }, { name: "description", content: "Catatan pengingat pribadi." }] }),
  component: Reminders,
});

type Reminder = { id: string; title: string; note: string | null; reminder_date: string | null };

function Reminders() {
  const { data: profileData, isLoading } = useProfile();
  const queryClient = useQueryClient();
  const userId = profileData?.profile?.id;
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [reminderDate, setReminderDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const query = useQuery({
    queryKey: ["personal-reminders", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase.from("personal_reminders").select("id,title,note,reminder_date").order("reminder_date", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Reminder[];
    },
  });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    if (!userId) return setErrorMessage("Profil belum siap. Coba lagi.");
    if (!title.trim()) return setErrorMessage("Isi pengingat terlebih dahulu.");
    setSaving(true);
    const { error } = await supabase.from("personal_reminders").insert({ account_id: userId, title: title.trim(), note: note.trim() || null, reminder_date: reminderDate || null });
    setSaving(false);
    if (error) return setErrorMessage(error.message);
    setTitle(""); setNote(""); setReminderDate("");
    await queryClient.invalidateQueries({ queryKey: ["personal-reminders"] });
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    const { error } = await supabase.from("personal_reminders").delete().eq("id", id);
    setDeleting(null);
    if (error) return setErrorMessage(error.message);
    await queryClient.invalidateQueries({ queryKey: ["personal-reminders"] });
  }

  if (isLoading) return <main className="mx-auto max-w-md px-5 py-10 text-sm text-muted-foreground">Memuat...</main>;

  return (
    <main className="mx-auto min-h-screen max-w-md px-5 pb-10 pt-6">
      <header>
        <Link to="/notes" className="mb-5 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="mr-2 h-4 w-4" /> Kembali ke Catatan</Link>
        <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Catatan Pribadi</div>
        <h1 className="mt-1 text-2xl font-bold">Pengingat</h1>
        <p className="mt-1 text-sm text-muted-foreground">Catat hal yang perlu Anda ingat: tagih toko, follow up, kirim barang, cek stok, dan lainnya.</p>
      </header>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4 rounded-2xl border p-4">
        <div className="flex items-center gap-2 font-semibold"><Plus className="h-4 w-4" /> Tambah Pengingat</div>
        <div className="space-y-2"><Label htmlFor="title">Pengingat</Label><Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Contoh: Tagih Toko Maju" required /></div>
        <div className="space-y-2"><Label htmlFor="reminderDate">Tanggal <span className="font-normal text-muted-foreground">(opsional)</span></Label><div className="relative"><CalendarDays className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input id="reminderDate" type="date" className="pl-9" value={reminderDate} onChange={(e) => setReminderDate(e.target.value)} /></div></div>
        <div className="space-y-2"><Label htmlFor="note">Catatan <span className="font-normal text-muted-foreground">(opsional)</span></Label><Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Detail yang perlu diingat" rows={3} /></div>
        {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
        <Button type="submit" className="w-full" disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bell className="mr-2 h-4 w-4" />}Simpan Pengingat</Button>
      </form>

      <section className="mt-6"><div className="mb-3"><h2 className="font-semibold">Daftar Pengingat</h2><p className="text-xs text-muted-foreground">Catatan ini hanya milik akun Anda.</p></div>
        {query.isError ? <div className="rounded-xl border p-4 text-sm text-destructive">Gagal memuat pengingat.</div> : (query.data ?? []).length === 0 ? <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Belum ada pengingat.</div> : <div className="space-y-2">{(query.data ?? []).map((item) => <article key={item.id} className="rounded-xl border p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="font-medium">{item.title}</div>{item.reminder_date && <div className="mt-1 text-xs text-muted-foreground">{new Date(`${item.reminder_date}T00:00:00`).toLocaleDateString("id-ID")}</div>}{item.note && <div className="mt-2 text-sm text-muted-foreground">{item.note}</div>}</div><Button type="button" variant="ghost" size="icon" aria-label="Hapus pengingat" onClick={() => handleDelete(item.id)} disabled={deleting === item.id}>{deleting === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}</Button></div></article>)}</div>}
      </section>
    </main>
  );
}
