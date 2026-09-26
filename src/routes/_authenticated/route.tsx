import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useProfile, profileQueryKey } from "@/hooks/use-profile";
import { accessStatus, ADMIN_TELEGRAM } from "@/lib/access";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: Gate,
});

function Gate() {
  const { data, isLoading, error } = useProfile();
  if (isLoading) return <div className="p-10 text-center text-muted-foreground">Memuat…</div>;
  if (error || !data?.profile) return <div className="p-10 text-center text-destructive">Profil tidak ditemukan.</div>;
  const status = accessStatus(data.profile, data.email);
  if (!status.allowed) return <Blocked />;
  if (!data.profile.business_name) return <Setup />;
  return <Outlet />;
}

function Blocked() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <div className="text-5xl">⏳</div>
      <p className="mt-6 text-lg font-medium">
        Masa trial 24 jam Anda telah berakhir. Silakan hubungi admin untuk memperpanjang lisensi.
      </p>
      <Button asChild size="lg" className="mt-8 h-14 w-full">
        <a href={ADMIN_TELEGRAM} target="_blank" rel="noreferrer">Hubungi Admin via Telegram</a>
      </Button>
      <button className="mt-4 text-sm text-muted-foreground underline" onClick={() => supabase.auth.signOut()}>Keluar</button>
    </main>
  );
}

function Setup() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("profiles").update({ business_name: name.trim() }).eq("id", u.user!.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: profileQueryKey });
  }
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Langkah 1 dari 1</div>
      <h1 className="mt-3 text-3xl font-bold">Nama bisnis / distributor Anda</h1>
      <p className="mt-2 text-sm text-muted-foreground">Nama ini akan tampil di bagian atas setiap nota.</p>
      <form onSubmit={save} className="mt-8 space-y-4">
        <div className="space-y-2"><Label>Nama Bisnis</Label>
          <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="cth. CV Kripik Mantap" className="h-12" /></div>
        <Button disabled={busy || !name.trim()} className="h-12 w-full">Simpan & Lanjut</Button>
      </form>
    </main>
  );
}
