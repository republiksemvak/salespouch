import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, MessageCircle, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ADMIN_WHATSAPP } from "@/lib/access";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/license")({
  head: () => ({
    meta: [
      { title: "Paket Lisensi — Sales Pouch" },
      { name: "description", content: "Pilih paket lisensi Premium Sales Pouch." },
    ],
  }),
  component: LicensePackagesPage,
});

type LicensePackage = {
  id: string;
  name: string;
  days: number;
  price: number;
  active: boolean;
};

const rupiah = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);

function LicensePackagesPage() {
  const { data: packages = [], isLoading, error } = useQuery({
    queryKey: ["public-active-license-packages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("license_packages")
        .select("id,name,days,price,active")
        .eq("active", true)
        .order("days", { ascending: true });
      if (error) throw error;
      return (data ?? []) as LicensePackage[];
    },
  });

  function contactAdmin(pkg: LicensePackage) {
    const message = [
      "Halo Admin Sales Pouch, saya ingin membeli paket lisensi:",
      `Paket: ${pkg.name}`,
      `Durasi: ${pkg.days} hari`,
      `Harga: ${rupiah(Number(pkg.price) || 0)}`,
      "",
      "Mohon informasi proses pembayaran dan aktivasi lisensinya. Terima kasih.",
    ].join("\n");
    window.open(`${ADMIN_WHATSAPP}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  }

  return (
    <main className="mx-auto min-h-screen max-w-md px-5 pb-12 pt-6">
      <Link to="/reports" className="inline-flex items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeft className="h-4 w-4" /> Kembali ke Laporan
      </Link>

      <header className="mt-5 rounded-3xl bg-primary p-5 text-primary-foreground">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-2xl font-bold">Paket Lisensi Sales Pouch</h1>
        <p className="mt-2 text-sm leading-6 opacity-90">
          Buka akses laporan keuangan dan fitur Premium sesuai paket yang Anda pilih.
        </p>
      </header>

      <section className="mt-5 rounded-2xl border bg-card p-4">
        <h2 className="font-semibold">Fitur Premium</h2>
        <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
          {["Laporan omset", "Laporan laba rugi dan profit", "Laporan piutang outlet", "Ekspor laporan ke Excel"].map((feature) => (
            <li key={feature} className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6">
        <h2 className="text-lg font-bold">Pilih Paket</h2>
        <p className="mt-1 text-sm text-muted-foreground">Harga dan durasi mengikuti pengaturan Super Admin.</p>

        {isLoading && <p className="mt-4 rounded-xl border p-4 text-sm text-muted-foreground">Memuat paket lisensi…</p>}
        {error && <p className="mt-4 rounded-xl border border-destructive/30 p-4 text-sm text-destructive">Paket lisensi gagal dimuat. Silakan muat ulang halaman.</p>}
        {!isLoading && !error && packages.length === 0 && (
          <p className="mt-4 rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">
            Belum ada paket lisensi aktif. Silakan hubungi admin untuk informasi lebih lanjut.
          </p>
        )}

        <div className="mt-3 space-y-3">
          {packages.map((pkg) => (
            <article key={pkg.id} className="rounded-2xl border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold">{pkg.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">Masa aktif {pkg.days} hari</p>
                </div>
                <div className="text-right text-lg font-bold text-primary">{rupiah(Number(pkg.price) || 0)}</div>
              </div>
              <Button className="mt-4 h-11 w-full" onClick={() => contactAdmin(pkg)}>
                <MessageCircle className="mr-2 h-4 w-4" /> Hubungi Admin untuk Membeli
              </Button>
            </article>
          ))}
        </div>
      </section>

      <p className="mt-6 text-center text-xs leading-5 text-muted-foreground">
        Paket Gratis tetap dapat digunakan tanpa batas waktu dengan maksimal 10 outlet. Pembelian dan aktivasi lisensi dikonfirmasi oleh admin.
      </p>
    </main>
  );
}
