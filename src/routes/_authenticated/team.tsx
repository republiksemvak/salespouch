import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, UserMinus } from "lucide-react";
import { toast } from "sonner";
import { useProfile } from "@/hooks/use-profile";
import { listTeam, inviteSales, removeSales } from "@/lib/team.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/team")({
  head: () => ({ meta: [{ title: "Manajemen Tim — Sales Pouch" }, { name: "description", content: "Kelola akun sales usaha Anda." }, { property: "og:title", content: "Manajemen Tim — Sales Pouch" }, { property: "og:description", content: "Kelola akun sales usaha Anda." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: TeamPage,
});

function TeamPage() {
  const { data: profile, isLoading } = useProfile();
  const owner = profile?.role === "owner";
  const fetchTeam = useServerFn(listTeam);
  const invite = useServerFn(inviteSales);
  const remove = useServerFn(removeSales);
  const qc = useQueryClient();
  const { data: members, error } = useQuery({ queryKey: ["team"], enabled: owner, queryFn: fetchTeam });
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  if (isLoading) return <div className="p-10 text-center">Memuat…</div>;
  if (!owner) return <div className="p-10 text-center text-destructive">Hanya Owner yang dapat mengelola tim.</div>;

  async function add(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try { await invite({ data: { email } }); setEmail(""); toast.success("Undangan dikirim ke email sales"); qc.invalidateQueries({ queryKey: ["team"] }); }
    catch (err) { toast.error((err as Error).message); }
    finally { setBusy(false); }
  }

  return <main className="mx-auto min-h-screen max-w-md px-5 pb-10 pt-6">
    <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" />Kembali</Link>
    <h1 className="mt-4 text-2xl font-bold">Manajemen Tim</h1>
    <form onSubmit={add} className="mt-6 space-y-3">
      <label className="text-sm font-medium">Email sales</label>
      <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="sales@contoh.com" className="h-12" />
      <Button disabled={busy} className="h-12 w-full">{busy ? "Mengirim…" : "Undang Sales"}</Button>
    </form>
    <h2 className="mt-8 text-sm font-semibold">Anggota tim ({members?.length ?? 0})</h2>
    {error && <p className="mt-3 text-sm text-destructive">Daftar tim tidak dapat dimuat.</p>}
    <div className="mt-3 space-y-2">{members?.map((member) => <div key={member.user_id} className="flex items-center justify-between gap-3 rounded border bg-card p-3">
      <div className="min-w-0"><div className="truncate text-sm font-medium">{(member.profiles as { user_email?: string } | null)?.user_email ?? "Sales"}</div><div className="text-xs text-muted-foreground">Sales</div></div>
      <Button variant="ghost" size="icon" aria-label="Hapus sales" title="Hapus sales dari tim" onClick={async () => { if (!confirm("Keluarkan sales dari tim?")) return; try { await remove({ data: { userId: member.user_id } }); qc.invalidateQueries({ queryKey: ["team"] }); toast.success("Sales dikeluarkan"); } catch (err) { toast.error((err as Error).message); } }}><UserMinus className="h-4 w-4" /></Button>
    </div>)}</div>
  </main>;
}