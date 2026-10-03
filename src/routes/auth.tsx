import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { salesAuthEmail } from "@/lib/sales-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Masuk — Sales Pouch" },
      { name: "description", content: "Masuk ke Sales Pouch." },
      { property: "og:title", content: "Masuk — Sales Pouch" },
      { property: "og:description", content: "Masuk ke Sales Pouch." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const value = identifier.trim();
      const email = value.includes("@") ? value.toLowerCase() : salesAuthEmail(value);
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error((err as Error).message);
    } finally { setBusy(false); }
  }

  async function google() {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/auth" });
    if (r.error) { toast.error(r.error.message); return; }
    if (r.redirected) return;
    navigate({ to: "/dashboard" });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-10">
      <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Sales Pouch</div>
      <h1 className="mt-3 text-3xl font-bold">Masuk</h1>
      <form onSubmit={submit} className="mt-8 space-y-4">
        <div className="space-y-2"><Label>Username atau Email</Label><Input required value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="username atau email" className="h-12" /></div>
        <div className="space-y-2"><Label>Password</Label><Input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="h-12" /></div>
        <Button type="submit" disabled={busy} className="h-12 w-full">{busy ? "Masuk…" : "Masuk"}</Button>
      </form>
      <Button variant="outline" onClick={google} className="mt-3 h-12 w-full">Lanjut dengan Google</Button>
    </main>
  );
}
