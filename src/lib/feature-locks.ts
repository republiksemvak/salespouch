export type FeatureAccess = "active" | "locked";

export type LockedFeature = {
  id: string;
  label: string;
  description: string;
  access: FeatureAccess;
};

/**
 * Central registry for modules that are being prepared but are not yet
 * customer-facing. Keep this UI-only for now; backend/RLS activation comes later.
 */
export const LOCKED_FEATURES: LockedFeature[] = [
  {
    id: "sales",
    label: "Sales",
    description: "Akun Sales, area kerja, outlet assigned, dan aktivitas kunjungan.",
    access: "locked",
  },
  {
    id: "sales-stock",
    label: "Stok Sales",
    description: "Stok yang dibawa Sales, penambahan, retur, dan rekonsiliasi.",
    access: "locked",
  },
  {
    id: "schedule-route",
    label: "Jadwal & Route",
    description: "Pembagian outlet berdasarkan Sales, hari kunjungan, dan urutan route.",
    access: "locked",
  },
  {
    id: "uang-jalan",
    label: "Uang Jalan",
    description: "Pencatatan uang jalan dan biaya operasional Sales.",
    access: "locked",
  },
  {
    id: "sales-kpi",
    label: "KPI Sales",
    description: "Ringkasan kunjungan, transaksi, penjualan, retur, dan pencapaian Sales.",
    access: "locked",
  },
  {
    id: "payroll",
    label: "Payroll",
    description: "Perhitungan gaji dan komponen pembayaran tim.",
    access: "locked",
  },
  {
    id: "gps-attendance",
    label: "GPS Attendance",
    description: "Kehadiran dan aktivitas lapangan berbasis lokasi.",
    access: "locked",
  },
  {
    id: "whatsapp-billing",
    label: "WhatsApp Billing",
    description: "Pengingat tagihan outlet melalui WhatsApp.",
    access: "locked",
  },
];

export function getLockedFeature(id: string) {
  return LOCKED_FEATURES.find((feature) => feature.id === id);
}
