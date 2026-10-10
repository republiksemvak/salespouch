import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  MessageCircle,
  QrCode,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ADMIN_WHATSAPP } from "@/lib/access";
import { useProfile } from "@/hooks/use-profile";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/license")({
  head: () => ({
    meta: [
      { title: "Upgrade Lisensi — Sales Pouch Pro" },
      { name: "description", content: "Pilih paket lisensi resmi Sales Pouch." },
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

const PAYMENT_LINKS: Record<number, string> = {
  30: "https://app.midtrans.com/payment-links/ab1c9776-00db-4b3d-ba5c-d72e0d048f3a-6u3x49gV",
  90: "https://app.midtrans.com/payment-links/a58c60ef-0995-4f67-8b1f-6cceb013c8b9-gebsaPVR",
  365: "https://app.midtrans.com/payment-links/90a930f9-235d-4eaf-a2c1-7a8b91b722fd-BK7J",
};

const rupiah = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);

function getPaymentLink(pkg: LicensePackage): string | null {
  const name = pkg.name.toLowerCase();

  if (name.includes("tahun") || name.includes("year") || pkg.days === 365) {
    return PAYMENT_LINKS[365];
  }
  if (name.includes("3 bulan") || name.includes("3 month") || pkg.days === 90) {
    return PAYMENT_LINKS[90];
  }
  if (name.includes("1 bulan") || name.includes("30 hari") || pkg.days === 30) {
    return PAYMENT_LINKS[30];
  }

  if (pkg.days <= 45) return PAYMENT_LINKS[30];
  if (pkg.days <= 120) return PAYMENT_LINKS[90];
  return PAYMENT_LINKS[365];
}

function getPackageLabel(pkg: LicensePackage): string {
  const name = pkg.name.toLowerCase();
  if (name.includes("tahun") || name.includes("year") || pkg.days === 365 || pkg.days === 120) {
    return "Paket 1 Tahun";
  }
  if (name.includes("3 bulan") || name.includes("3 month") || pkg.days === 90) {
    return "Paket 3 Bulan";
  }
  if (name.includes("1 bulan") || name.includes("30 hari") || pkg.days === 30) {
    return "Paket 1 Bulan";
  }
  return pkg.name;
}

function LicensePackagesPage() {
  const { data: account } = useProfile();
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  const activeSelectedPkg =
    packages.find((pkg) => pkg.id === selectedId) ||
    packages.find((pkg) => pkg.days === 90) ||
    packages[0];

  const licenseUntil = account?.profile?.license_until;
  const isLicensed = Boolean(
    licenseUntil && new Date(licenseUntil).getTime() > Date.now(),
  );
  const daysLeft = isLicensed
    ? Math.ceil(
        (new Date(licenseUntil!).getTime() - Date.now()) /
          (1000 * 60 * 60 * 24),
      )
    : 0;

  function handlePay() {
    if (!activeSelectedPkg) return;
    const link = getPaymentLink(activeSelectedPkg);
    if (link) {
      window.open(link, "_blank", "noopener,noreferrer");
    } else {
      handleWhatsApp();
    }
  }

  function handleWhatsApp() {
    const userEmail = account?.profile?.user_email || account?.email || "-";
    const businessName = account?.profile?.business_name || "-";
    const pkgName = activeSelectedPkg
      ? `${getPackageLabel(activeSelectedPkg)} (${activeSelectedPkg.days} hari)`
      : "Paket Lisensi";
    const amount = activeSelectedPkg
      ? rupiah(Number(activeSelectedPkg.price) || 0)
      : "";

    const message = [
      "Halo Admin Sales Pouch, saya ingin konfirmasi pembayaran lisensi:",
      `• Usaha: ${businessName}`,
      `• Email Akun: ${userEmail}`,
      `• Paket: ${pkgName}`,
      amount ? `• Nominal: ${amount}` : "",
      "",
      "Saya sudah melakukan pembayaran melalui QRIS atau transfer bank. Mohon bantuan pengecekan dan aktivasinya. Terima kasih!",
    ]
      .filter(Boolean)
      .join("\n");

    window.open(
      `${ADMIN_WHATSAPP}?text=${encodeURIComponent(message)}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-14 pt-4">
      <div className="flex items-center justify-between">
        <Link
          to="/reports"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Kembali
        </Link>
        <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
          Sales Pouch Pro
        </span>
      </div>

      <div
        className={`mt-3 flex items-center justify-between rounded-xl border p-3 ${
          isLicensed
            ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-950 dark:text-emerald-200"
            : "border-border bg-card"
        }`}
      >
        <div className="flex items-center gap-2.5">
          {isLicensed ? (
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white">
              <ShieldCheck className="h-4 w-4" />
            </div>
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <ShieldAlert className="h-4 w-4" />
            </div>
          )}
          <div>
            <div className="text-xs font-semibold leading-tight">
              {isLicensed ? "Lisensi Pro Aktif" : "Paket Freemium"}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {isLicensed
                ? `Sisa masa aktif ${daysLeft} hari lagi`
                : "Maksimal 10 outlet · Laporan terkunci"}
            </div>
          </div>
        </div>
        <span className="rounded-full border bg-background px-2 py-0.5 text-[11px] font-medium">
          {isLicensed ? "Perpanjang" : "Tingkatkan"}
        </span>
      </div>

      <div className="mt-4 rounded-xl border bg-card p-3 shadow-2xs">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <Sparkles className="h-3.5 w-3.5 text-amber-500" />
          Keuntungan Akun Pro
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3 w-3 shrink-0 text-primary" />
            <span>Outlet tanpa batas</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3 w-3 shrink-0 text-primary" />
            <span>Laporan omset & laba</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3 w-3 shrink-0 text-primary" />
            <span>AR aging & piutang</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3 w-3 shrink-0 text-primary" />
            <span>Ekspor Excel lengkap</span>
          </div>
        </div>
      </div>

      <section className="mt-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Pilih Paket Langganan</h2>
          <span className="text-[11px] text-muted-foreground">Pilih paket</span>
        </div>

        {isLoading ? (
          <div className="mt-3 space-y-2">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="h-16 animate-pulse rounded-xl border bg-muted/40"
              />
            ))}
          </div>
        ) : error ? (
          <p className="mt-3 rounded-xl border border-destructive/30 p-4 text-sm text-destructive">
            Paket lisensi gagal dimuat. Silakan muat ulang halaman.
          </p>
        ) : packages.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            Belum ada paket lisensi aktif.
          </p>
        ) : (
          <div className="mt-2.5 space-y-2">
            {packages.map((pkg) => {
              const isSelected = activeSelectedPkg?.id === pkg.id;
              const isBest = pkg.days === 365 || pkg.name.toLowerCase().includes("tahun");
              const isPopular = pkg.days === 90 || pkg.name.toLowerCase().includes("3 bulan");

              return (
                <button
                  key={pkg.id}
                  type="button"
                  onClick={() => setSelectedId(pkg.id)}
                  aria-pressed={isSelected}
                  className={`relative flex w-full items-center justify-between rounded-xl border p-3 text-left transition-all ${
                    isSelected
                      ? "border-primary bg-primary/5 shadow-xs ring-1 ring-primary"
                      : "border-border bg-card hover:border-muted-foreground/30"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                        isSelected
                          ? "border-primary bg-primary"
                          : "border-muted-foreground/40"
                      }`}
                    >
                      {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-bold text-foreground">
                          {getPackageLabel(pkg)}
                        </span>
                        {isBest && (
                          <span className="rounded border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">
                            Paling Hemat
                          </span>
                        )}
                        {isPopular && (
                          <span className="rounded border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                            Populer
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Masa aktif {pkg.days} hari
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-sm font-bold text-primary">
                      {rupiah(Number(pkg.price) || 0)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {pkg.days >= 30
                        ? `~${rupiah(
                            Math.round(
                              (Number(pkg.price) || 0) / (pkg.days / 30),
                            ),
                          )}/bln`
                        : ""}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {activeSelectedPkg && (
        <div className="mt-5 space-y-3 rounded-2xl border bg-card p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Total bayar:</span>
            <span className="text-base font-bold text-primary">
              {rupiah(Number(activeSelectedPkg.price) || 0)}
            </span>
          </div>

          <Button
            onClick={handlePay}
            className="flex h-12 w-full items-center justify-center gap-2 text-sm font-semibold shadow-xs"
          >
            <QrCode className="h-4 w-4" />
            <span>Bayar Sekarang (QRIS / Bank)</span>
            <ExternalLink className="ml-auto h-3.5 w-3.5 opacity-80" />
          </Button>

          <div className="pt-1 text-center">
            <button
              type="button"
              onClick={handleWhatsApp}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-emerald-600"
            >
              <MessageCircle className="h-3 w-3 text-emerald-600" />
              Sudah transfer? <u>Konfirmasi via WhatsApp</u>
            </button>
          </div>
        </div>
      )}

      <p className="mt-4 text-center text-[10px] leading-relaxed text-muted-foreground">
        Bisa scan <b>QRIS</b> (GoPay, OVO, DANA, ShopeePay) atau <b>transfer bank</b>
        melalui pilihan yang tersedia di halaman pembayaran.
      </p>
    </main>
  );
}
