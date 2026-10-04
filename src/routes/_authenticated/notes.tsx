import { createFileRoute, Link } from "@tanstack/react-router";
import { Bell, ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { useProfile } from "@/hooks/use-profile";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/notes")({
  head: () => ({
    meta: [
      { title: "Catatan — Sales Pouch" },
      { name: "description", content: "Catatan pengeluaran sales, pemasukan lain, dan pengingat." },
    ],
  }),
  component: Notes,
});

function Notes() {
  const { data: profileData, isLoading } = useProfile();
  const canUseExpenses = profileData?.role === "owner" || profileData?.role === "sales";

  if (isLoading) return <main className="mx-auto max-w-md px-5 py-10 text-sm text-muted-foreground">Memuat...</main>;

  return (
    <main className="mx-auto min-h-screen max-w-md px-5 pb-10 pt-6">
      <header>
        <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Sales Pouch</div>
        <h1 className="mt-1 text-2xl font-bold">Catatan</h1>
        <p className="mt-1 text-sm text-muted-foreground">Catat hal penting dalam kegiatan usaha.</p>
      </header>

      <section className="mt-6 grid gap-3">
        {canUseExpenses ? (
          <Link to="/expenses" className="block">
            <Button type="button" variant="outline" className="h-auto min-h-16 w-full justify-start px-4 py-3 text-left">
              <ArrowDownCircle className="mr-3 h-5 w-5 shrink-0" />
              <span className="min-w-0"><span className="block font-semibold">Pengeluaran Sales</span><span className="mt-0.5 block text-xs font-normal text-muted-foreground">Catat bensin, parkir, tol, pulsa, dan biaya operasional lainnya.</span></span>
            </Button>
          </Link>
        ) : (
          <Button type="button" variant="outline" className="h-auto min-h-16 w-full justify-start px-4 py-3 text-left" disabled>
            <ArrowDownCircle className="mr-3 h-5 w-5 shrink-0" />
            <span className="min-w-0"><span className="block font-semibold">Pengeluaran Sales</span><span className="mt-0.5 block text-xs font-normal text-muted-foreground">Tersedia untuk Owner dan Sales.</span></span>
          </Button>
        )}

        <Button type="button" variant="outline" className="h-auto min-h-16 justify-start px-4 py-3 text-left" disabled>
          <ArrowUpCircle className="mr-3 h-5 w-5 shrink-0" />
          <span className="min-w-0"><span className="block font-semibold">Pemasukan Lain</span><span className="mt-0.5 block text-xs font-normal text-muted-foreground">Pemasukan di luar transaksi penjualan: bonus, komisi, atau pemasukan lainnya.</span></span>
        </Button>

        <Button type="button" variant="outline" className="h-auto min-h-16 justify-start px-4 py-3 text-left" disabled>
          <Bell className="mr-3 h-5 w-5 shrink-0" />
          <span className="min-w-0"><span className="block font-semibold">Pengingat</span><span className="mt-0.5 block text-xs font-normal text-muted-foreground">Hal yang perlu diingat: tagih toko, follow up pelanggan, kirim barang, cek stok.</span></span>
        </Button>
      </section>

      <div className="mt-6 rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
        Pengeluaran Sales sudah aktif untuk Owner dan Sales. Pemasukan Lain dan Pengingat belum aktif.
      </div>
    </main>
  );
}
