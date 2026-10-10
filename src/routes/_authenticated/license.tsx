import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  MessageCircle,
  ShieldCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ADMIN_WHATSAPP } from "@/lib/access";
import { useProfile } from "@/hooks/use-profile";
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

const MIDTRANS_LINKS: Record<number, string> = {
  30: "https://app.midtrans.com/payment-links/ab1c9776-00db-4b3d-ba5c-d72e0d048f3a-6u3x49gV",
  90: "https://app.midtrans.com/payment-links/a58c60ef-0995-4f67-8b1f-6cceb013c8b9-gebsaPVR",
  365: "https://app.midtrans.com/payment-links/90a930f9-235d-4eaf-a2c1-7a8b91b722fd-BK7J",
};

function getPaymentLink(pkg: LicensePackage): string | null {
  if (MIDTRANS_LINKS[pkg.days]) return MIDTRANS_LINKS[pkg.days];

  const name = pkg.name.toLowerCase();
  if (name.includes("1 bulan") || name.includes("30")) return MIDTRANS_LINKS[30];
  if (name.includes("3 bulan") || name.includes("90")) return MIDTRANS_LINKS[90];
  if (name.includes("1 tahun") || name.includes("365")) return MIDTRANS_LINKS[365];

  return null;
}

const rupiah = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);

function LicensePackagesPage() {
  const { data: account } = useProfile();

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
    const userEmail = account?.profile?.user_email || account?.email || "-";
    const businessName = account?.profile?.business_name || "-";

    const message = [
      "Halo Admin Sales Pouch, saya ingin konfirmasi pembayaran lisensi:",
      `Usaha: ${businessName}`,
      `Email Akun: ${userEmail}`,
      `Paket: ${pkg.name} (${pkg.days} hari)`,
      `Nominal: ${rupiah(Number(pkg.price) || 0)}`,
      "",
      "Saya sudah / akan melakukan pembayaran melalui Midtrans. Mohon bantuannya untuk pengecekan lisensi. Terima kasih!",
    ].join("\n");

    window.open(
      `${ADMIN_WHATSAPP}?text=${encodeURIComponent(message)}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  function openMidtrans(pkg: LicensePackage) {
    const link = getPaymentLink(pkg);
    if (link) {
      window.open(link, "_blank", "noopener,noreferrer");
    } else {
      contactAdmin(pkg);
    }
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
          Buka akses penuh laporan omzet, laba rugi, dan fitur Premium sesuai paket lisensi Anda.
        </p>
      </header>

      <section className="mt-5 rounded-2xl border bg-card p-4">
        <h2 className="text-sm font-semibold">Metode Pembayaran Tersedia</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Pembayaran melalui halaman resmi Midtrans: <strong>QRIS</strong> dan
          <strong> transfer Virtual Account</strong> bank yang tersedia pada halaman pembayaran.
        </p>
      </section>

      <section className="mt-5 rounded-2xl border bg-card p-4">
        <h2 className="font-semibold">Fitur Premium</h2>
        <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
          {[
            "Jumlah outlet tidak terbatas",
            "Laporan omset",
            "Laporan laba rugi dan profit",
            "Laporan piutang outlet",
            "Ekspor laporan ke Excel",
          ].map((feature) => (
            <li key={feature} className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6">
        <h2 className="text-lg font-bold">Pilih Paket Lisensi</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Harga dan durasi mengikuti pengaturan paket aktif di Sales Pouch.
        </p>

        {isLoading && (
          <p className="mt-4 rounded-xl border p-4 text-sm text-muted-foreground">
            Memuat paket lisensi…
          </p>
        )}
        {error && (
          <p className="mt-4 rounded-xl border border-destructive/30 p-4 text-sm text-destructive">
            Paket lisensi gagal dimuat. Silakan muat ulang halaman.
          </p>
        )}
        {!isLoading && !error && packages.length === 0 && (
          <p className="mt-4 rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">
            Belum ada paket lisensi aktif. Silakan hubungi admin untuk informasi lebih lanjut.
          </p>
        )}

        <div className="mt-3 space-y-3">
          {packages.map((pkg) => {
            const hasMidtrans = Boolean(getPaymentLink(pkg));

            return (
              <article key={pkg.id} className="rounded-2xl border bg-card p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold">{pkg.name}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Masa aktif {pkg.days} hari
                    </p>
                  </div>
                  <div className="text-right text-lg font-bold text-primary">
                    {rupiah(Number(pkg.price) || 0)}
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  <Button className="h-11 w-full" onClick={() => openMidtrans(pkg)}>
                    <CreditCard className="mr-2 h-4 w-4" />
                    {hasMidtrans
                      ? "Bayar via Midtrans (QRIS / Bank Transfer)"
                      : "Beli Lisensi"}
                    <ExternalLink className="ml-1.5 h-3.5 w-3.5 opacity-70" />
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 w-full text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => contactAdmin(pkg)}
                  >
                    <MessageCircle className="mr-1.5 h-3.5 w-3.5 text-emerald-600" />
                    Konfirmasi / Kirim Bukti ke WhatsApp
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <p className="mt-6 text-center text-xs leading-5 text-muted-foreground">
        Setelah pembayaran selesai, hubungi admin melalui WhatsApp untuk mengirim konfirmasi.
        Aktivasi atau perpanjangan lisensi tetap dilakukan oleh admin.
      </p>

      <p className="mt-3 text-center text-xs leading-5 text-muted-foreground">
        Paket Gratis tetap dapat digunakan tanpa batas waktu dengan maksimal 10 outlet.
      </p>
    </main>
  );
}
