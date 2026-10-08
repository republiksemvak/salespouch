export type ManagedJobLevel = "admin" | "manager" | "sales";

export type AccessItem = {
  key: string;
  label: string;
  description: string;
  viewKey: string;
};

export type AccessGroup = {
  title: string;
  items: AccessItem[];
};

export const MANAGER_ADMIN_DEFAULTS = [
  "team.view",
  "outlets.view",
  "schedule.view",
  "sales_stock.view",
  "transactions.view",
  "operations.view",
  "travel_funds.view",
  "expenses.view",
  "reports.view",
  "kpi.view",
  "direct_selling.view",
  "products.view",
  "master_stock.view",
  "notes.view",
] as const;

// Sales access is intentionally left on the existing permission model.
export const SALES_DEFAULTS = [
  "outlets",
  "sales_stock",
  "transactions",
  "travel_funds",
  "notes",
  "expenses",
] as const;

export const ACCESS_GROUPS: AccessGroup[] = [
  {
    title: "Operasional",
    items: [
      { key: "team.view", label: "Tim", description: "Melihat dan mengelola tim sesuai kewenangan.", viewKey: "team.view" },
      { key: "outlets.view", label: "Outlet", description: "Melihat dan mengelola data outlet.", viewKey: "outlets.view" },
      { key: "schedule.view", label: "Jadwal Toko", description: "Melihat dan mengatur jadwal kunjungan outlet.", viewKey: "schedule.view" },
      { key: "sales_stock.view", label: "Stok Sales", description: "Melihat dan mengelola stok Sales.", viewKey: "sales_stock.view" },
      { key: "transactions.view", label: "Transaksi", description: "Melihat dan mengelola transaksi.", viewKey: "transactions.view" },
      { key: "operations.view", label: "Ringkasan Operasional", description: "Melihat saldo dan rekap operasional Sales.", viewKey: "operations.view" },
      { key: "travel_funds.view", label: "Uang Jalan", description: "Melihat dan mengelola uang jalan Sales.", viewKey: "travel_funds.view" },
      { key: "expenses.view", label: "Pengeluaran", description: "Melihat dan mengelola pengeluaran Sales.", viewKey: "expenses.view" },
      { key: "direct_selling.view", label: "Direct Selling", description: "Mengelola penjualan langsung dari gudang.", viewKey: "direct_selling.view" },
    ],
  },
  {
    title: "Analitik",
    items: [
      { key: "reports.view", label: "Laporan", description: "Melihat laporan bisnis dan penjualan.", viewKey: "reports.view" },
      { key: "kpi.view", label: "KPI", description: "Melihat KPI dan penilaian kinerja.", viewKey: "kpi.view" },
    ],
  },
  {
    title: "Master",
    items: [
      { key: "products.view", label: "Master Produk", description: "Mengelola data produk bisnis.", viewKey: "products.view" },
      { key: "master_stock.view", label: "Master Stok", description: "Mengelola stok gudang.", viewKey: "master_stock.view" },
      { key: "notes.view", label: "Catatan", description: "Melihat dan mengelola catatan operasional.", viewKey: "notes.view" },
      { key: "profile.view", label: "Profil Usaha", description: "Mengelola profil dan pengaturan usaha.", viewKey: "profile.view" },
    ],
  },
];

export function hasAccess(permissions: string[], key: string) {
  return permissions.includes(key);
}
