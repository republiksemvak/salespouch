export type JobLevel = "admin" | "manager" | "sales";

export type PermissionGroup = {
  title: string;
  items: { key: string; label: string; description: string }[];
};

/**
 * Permission is capability-based. A role supplies the recommended baseline;
 * Owner remains free to add/remove individual capabilities per user.
 */
export const permissionGroups: PermissionGroup[] = [
  {
    title: "Operasional",
    items: [
      { key: "team", label: "Tim", description: "Melihat dan mengelola data tim sesuai kewenangan." },
      { key: "outlets", label: "Outlet", description: "Melihat dan mengelola data outlet." },
      { key: "schedule", label: "Jadwal Toko", description: "Mengatur jadwal kunjungan outlet." },
      { key: "sales_stock", label: "Stok Sales", description: "Melihat dan mengelola stok Sales." },
      { key: "transactions", label: "Transaksi", description: "Melihat dan mengelola transaksi." },
      { key: "operations", label: "Operasional", description: "Melihat uang jalan, pengeluaran, saldo, dan rekap operasional." },
      { key: "direct_selling", label: "Direct Selling", description: "Mengelola penjualan langsung dari gudang." },
    ],
  },
  {
    title: "Analitik",
    items: [
      { key: "reports", label: "Laporan", description: "Melihat laporan bisnis dan penjualan." },
      { key: "kpi", label: "KPI", description: "Akses KPI dan penilaian kinerja." },
    ],
  },
  {
    title: "Keuangan & SDM",
    items: [
      { key: "travel_funds", label: "Uang Jalan", description: "Melihat dan mengelola uang jalan Sales." },
      { key: "notes", label: "Catatan", description: "Melihat dan mengelola catatan operasional." },
      { key: "payroll", label: "Payroll", description: "Akses penggajian dan data payroll." },
    ],
  },
  {
    title: "Master & Data",
    items: [
      { key: "products", label: "Master Produk", description: "Mengelola data produk bisnis." },
      { key: "master_stock", label: "Master Stok", description: "Mengelola data stok gudang." },
      { key: "profile", label: "Profil Usaha", description: "Mengelola data profil dan pengaturan usaha." },
    ],
  },
];

export const levelDefaults: Record<JobLevel, string[]> = {
  // Admin: data, reporting, finance/back-office execution.
  admin: [
    "outlets",
    "transactions",
    "reports",
    "travel_funds",
    "notes",
    "payroll",
    "products",
    "master_stock",
    "profile",
  ],
  // Manager: people/HR and field operations.
  manager: [
    "team",
    "outlets",
    "schedule",
    "sales_stock",
    "transactions",
    "operations",
    "direct_selling",
    "travel_funds",
    "notes",
    "kpi",
    "payroll",
  ],
  // Sales: field execution.
  sales: ["outlets", "schedule", "sales_stock", "transactions", "travel_funds", "notes"],
};

export const permissionKeys = permissionGroups.flatMap((group) => group.items.map((item) => item.key));
