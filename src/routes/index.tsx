import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Store, Receipt, Wallet, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sales Pouch — Nota Konsinyasi untuk Sales Lapangan" },
      { name: "description", content: "Catat kunjungan outlet, hitung konsinyasi & piutang, dan cetak nota thermal digital dari HP." },
      { property: "og:title", content: "Sales Pouch — Nota Konsinyasi untuk Sales Lapangan" },
      { property: "og:description", content: "Catat kunjungan outlet, hitung konsinyasi & piutang, dan cetak nota thermal digital dari HP." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isMounted) return;
      if (session?.user) {
        navigate({ to: "/dashboard", replace: true });
      } else {
        setCheckingAuth(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [navigate]);

  if (checkingAuth) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-3 text-xs text-muted-foreground font-mono">Membuka Dashboard…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-6 py-10">
      <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
        <span className="h-2 w-2 rounded-full bg-primary" /> Sales Pouch
      </div>
      <h1 className="mt-10 text-5xl font-bold leading-[1.05] tracking-tight">
        Kantong kerja<br />sales lapangan.
      </h1>
      <p className="mt-4 text-muted-foreground">
        Titip barang, hitung laku & retur, catat piutang, lalu kirim nota thermal — semua dari HP.
      </p>
      <ul className="mt-8 space-y-3">
        {[
          { icon: Store, t: "Kelola outlet + foto & lokasi" },
          { icon: Wallet, t: "Hitung konsinyasi & sisa utang otomatis" },
          { icon: Receipt, t: "Nota thermal digital siap dibagikan" },
        ].map(({ icon: I, t }) => (
          <li key={t} className="flex items-center gap-3 rounded-xl border bg-card p-4">
            <I className="h-5 w-5 text-primary" /> <span className="text-sm font-medium">{t}</span>
          </li>
        ))}
      </ul>
      <div className="mt-auto pt-10">
        <Button asChild size="lg" className="h-14 w-full text-base">
          <Link to="/auth">Mulai — Masuk Akun</Link>
        </Button>
      </div>
    </main>
  );
}
