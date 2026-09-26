import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Store, Receipt, Wallet } from "lucide-react";

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
          <Link to="/dashboard">Mulai — Trial 24 Jam Gratis</Link>
        </Button>
      </div>
    </main>
  );
}
