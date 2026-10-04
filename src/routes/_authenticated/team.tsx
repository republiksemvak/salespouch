import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, UserMinus } from "lucide-react";
import { toast } from "sonner";
import { useProfile } from "@/hooks/use-profile";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { listTeam, createSales, removeSales } from "@/lib/team.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/team")({
  head: () => ({ meta: [{ title: "Manajemen Tim — Sales Pouch" }, { name: "description", content: "Kelola akun sales usaha Anda." }, { property: "og:title", content: "Manajemen Tim — Sales Pouch" }, { property: "og:description", content: "Kelola akun sales usaha Anda." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: TeamPage,
});

function TeamPage() {
  const { data: profile, isLoading: profileLoading } = useProfile();
  const { data: isAdmin, isLoading: adminLoading } = useIsAdmin();
  const owner = profile?.role === "owner";
  const superAdmin = !!isAdmin;
  const fetchTeam = useServerFn(listTeam);
  const create = useServerFn(createSales);
  const remove = useServerFn(removeSales);
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const activeOwnerId = profile?.id;
  const { data: members, error } = useQuery({
    queryKey: ["team", activeOwnerId],
    enabled: !profileLoading && !adminLoading && (!!owner || superAdmin),
    queryFn: () => fetchTeam({ data: {} }),
  });

  if (profileLoading || adminLoading) return <div className="p-10 text-center">Memuat…</div>;
  if (!owner && !superAdmin) return <div className="p-10 text-center text-destructive">Hanya Owner atau Super Admin yang dapat mengelola tim.</div>;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await create({ data: { name, username, password } });
      setName(""); setUsername(""); setPassword("");
      toast.success("Akun Sales berhasil dibuat dan dihubungkan ke tim");
      qc.invalidateQueries({ queryKey: ["team", activeOwnerId] });
    } catch (err) { toast.error((err as Error).message); }
    finally { setBusy(false); }
  }

  return <main className="mx-auto min-h-screen max-w-md px-5 pb-10 pt-6">
    <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" />Kembali</Link>
    <h1 className="mt-4 text-2xl font-bold">Manajemen Tim</h1>

    <form onSubmit={add} className="mt-6 space-y-3">
      <label className="text-sm font-medium">Nama Sales</label>
      <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Budi" className="h-12" />
      <label className="text-sm font-medium">Username</label>
      <Input required minLength={3} maxLength={30} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="budi.sales" className="h-12" />
      <label className="text-sm font-medium">Password</label>
      <Input required minLength={6} maxLength={72} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimal 6 karakter" className="h-12" />
      <Button disabled={busy} className="h-12 w-full">{busy ? "Membuat akun…" : "Buat Akun Sales"}</Button>
    </form>

    <h2 className="mt-8 text-sm font-semibold">Anggota tim ({members?.length ?? 0})</h2>
    {error && <p className="mt-3 text-sm text-destructive">Daftar tim tidak dapat dimuat.</p>}
    <div className="mt-3 space-y-2">{members?.map((member) => {
      const p = member.profiles as { user_email?: string; username?: string; display_name?: string } | null;
      return <div key={member.user_id} className="flex items-center justify-between gap-3 rounded border bg-card p-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{p?.display_name ?? p?.username ?? p?.user_email ?? "Sales"}</div>
          <div className="truncate text-xs text-muted-foreground">{p?.username ? `@${p.username}` : "Sales"}</div>
        </div>
        <Button variant="ghost" size="icon" aria-label="Hapus sales" title="Hapus sales dari tim" onClick={async () => { if (!confirm("Keluarkan sales dari tim?")) return; try { await remove({ data: { userId: member.user_id } }); qc.invalidateQueries({ queryKey: ["team", activeOwnerId] }); toast.success("Sales dikeluarkan"); } catch (err) { toast.error((err as Error).message); } }}><UserMinus className="h-4 w-4" /></Button>
      </div>;
    })}</div>
  </main>;
}
