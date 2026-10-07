import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Bell, ArrowDownCircle } from "lucide-react";
import { useProfile } from "@/hooks/use-profile";
import { isSuperAdminEmail } from "@/lib/access";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/notes")({
  head: () => ({
    meta: [
      { title: "Catatan — Sales Pouch" },
      { name: "description", content: "Catatan pengeluaran sales dan pengingat." },
    ],
  }),
  component: Notes,
});

function Notes() {
  const { data: profileData, isLoading } = useProfile();
  const isSuperAdmin = isSuperAdminEmail(profileData?.email);
  const canUseReminders = isSuperAdmin || profileData?.role === "owner" || profileData?.role === "sales";
  const canUseExpenses = isSuperAdmin || profileData?.role === "owner" || profileData?.role === "sales";

  if (isLoading) return <main className="mx-auto max-w-md px-5 py-10 text-sm text-muted-foreground">Memuat...</main>;

  return (
    <main className="mx-auto min-h-screen max-w-md px-5 pb-10 pt-6">
      <header>
        <Link to="/" className="mb-5 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="mr-2 h-4 w-4" /> Kembali ke Beranda</Link>
        <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Sales Pouch</div>
        <h1 className="mt-1 text-2xl font-bold">Catatan</h1>
        <p className="mt-1 text-sm text-muted-foreground">Catat hal penting dalam kegiatan usaha.</p>
      </header>

      <section className="mt-6 grid gap-3">
        {canUseExpenses ? (
          <Link to="/expenses" className="block min-w-0">
            <Button type="button" variant="outline" className="h-auto min-h-16 w-full min-w-0 justify-start whitespace-normal px-4 py-3 text-left">
              <ArrowDownCircle className="mr-3 mt-0.5 h-5 w-5 shrink-0 self-start" />
              <span className="min-w-0 flex-1 break-words"><span className="block font-semibold">Pengeluaran Sales</span><span className="mt-0.5 block text-xs font-normal text-muted-foreground">Catat bensin, parkir, tol, pulsa, dan biaya operasional lainnya.</span></span>
            </Button>
          </Link>
        ) : (
          <Button type="button" variant="outline" className="h-auto min-h-16 w-full min-w-0 justify-start whitespace-normal px-4 py-3 text-left" disabled>
            <ArrowDownCircle className="mr-3 mt-0.5 h-5 w-5 shrink-0 self-start" />
            <span className="min-w-0 flex-1 break-words"><span className="block font-semibold">Pengeluaran Sales</span><span className="mt-0.5 block text-xs font-normal text-muted-foreground">Tersedia untuk Owner, Sales, dan Super Admin.</span></span>
          </Button>
        )}

        {canUseReminders ? (
          <Link to="/reminders" className="block min-w-0">
            <Button type="button" variant="outline" className="h-auto min-h-16 w-full min-w-0 justify-start whitespace-normal px-4 py-3 text-left">
              <Bell className="mr-3 mt-0.5 h-5 w-5 shrink-0 self-start" />
              <span className="min-w-0 flex-1 break-words"><span className="block font-semibold">Pengingat</span><span className="mt-0.5 block text-xs font-normal text-muted-foreground">Catat tagih toko, follow up, kirim barang, cek stok, dan hal lainnya.</span></span>
            </Button>
          </Link>
        ) : (
          <Button type="button" variant="outline" className="h-auto min-h-16 w-full min-w-0 justify-start whitespace-normal px-4 py-3 text-left" disabled>
            <Bell className="mr-3 mt-0.5 h-5 w-5 shrink-0 self-start" />
            <span className="min-w-0 flex-1 break-words"><span className="block font-semibold">Pengingat</span><span className="mt-0.5 block text-xs font-normal text-muted-foreground">Catatan pribadi akun.</span></span>
          </Button>
        )}
      </section>

      <div className="mt-6 rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
        {isSuperAdmin ? "Super Admin memiliki akses penuh untuk pengujian. Pengingat aktif sebagai catatan pribadi." : "Pengingat adalah catatan pribadi akun dan tidak tersinkron ke data usaha."}
      </div>
    </main>
  );
}
