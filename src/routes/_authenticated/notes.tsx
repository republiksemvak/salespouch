import { createFileRoute } from "@tanstack/react-router";
import { FileText, Bell, ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/notes")({
  head: () => ({
    meta: [
      { title: "Catatan — Sales Pouch" },
      { name: "description", content: "Catatan usaha, pengeluaran, pemasukan, dan pengingat." },
    ],
  }),
  component: Notes,
});

function Notes() {
  return (
    <main className="mx-auto min-h-screen max-w-md px-5 pb-10 pt-6">
      <header>
        <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Sales Pouch</div>
        <h1 className="mt-1 text-2xl font-bold">Catatan</h1>
        <p className="mt-1 text-sm text-muted-foreground">Simpan catatan dan kelola transaksi tambahan usaha.</p>
      </header>

      <section className="mt-6 grid gap-2">
        <Button type="button" variant="outline" className="h-12 justify-start" disabled>
          <FileText className="mr-3 h-5 w-5" />
          <span>Catatan Biasa</span>
        </Button>
        <Button type="button" variant="outline" className="h-12 justify-start" disabled>
          <ArrowDownCircle className="mr-3 h-5 w-5" />
          <span>Pengeluaran Lain</span>
        </Button>
        <Button type="button" variant="outline" className="h-12 justify-start" disabled>
          <ArrowUpCircle className="mr-3 h-5 w-5" />
          <span>Pemasukan Lain</span>
        </Button>
        <Button type="button" variant="outline" className="h-12 justify-start" disabled>
          <Bell className="mr-3 h-5 w-5" />
          <span>Pengingat</span>
        </Button>
      </section>

      <div className="mt-6 rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
        Fitur Catatan sedang disiapkan. Menu dan transaksi akan ditambahkan pada tahap berikutnya.
      </div>
    </main>
  );
}
