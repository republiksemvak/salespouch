export type ManagedJobLevel = "admin" | "manager" | "sales";

export type AccessItem = {
  key: string;
  label: string;
  description: string;
  viewKey?: string;
  children?: { key: string; label: string; description: string }[];
};

export type AccessGroup = {
  title: string;
  items: AccessItem[];
};

// Default Admin: administrasi data, gudang, direct selling, dan pencatatan.
export const ADMIN_DEFAULTS = [
  "outlets.view",
  "transactions.view",
  "sales_stock.view",
  "sales_stock.load",
  "direct_selling.view",
  "direct_selling.sale",
  "direct_selling.return",
  "expenses.view",
  "reports.view",
  "reports.export",
  "products.view",
  "master_stock.view",
  "master_stock.incoming",
  "master_stock.damage",
  "notes.view",
] as const;

// Default Manager: supervisi tim, rute kunjungan, stok sales, uang jalan, dan evaluasi.
export const MANAGER_DEFAULTS = [
  "team.view",
  "outlets.view",
  "schedule.view",
  "sales_stock.view",
  "sales_stock.load",
  "sales_stock.return",
  "transactions.view",
  "operations.view",
  "operations.travel_funds",
  "operations.expenses",
  "operations.reports",
  "operations.export",
  "expenses.view",
  "reports.view",
  "reports.receivables",
  "reports.export",
  "kpi.view",
  "products.view",
  "master_stock.view",
  "notes.view",
] as const;

// Alias untuk kompatibilitas mundur.
export const MANAGER_ADMIN_DEFAULTS = MANAGER_DEFAULTS;

// Sales tetap menggunakan model hak akses yang sudah berjalan.
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
      {
        key: "team.view", label: "Tim", description: "Melihat dan mengelola tim sesuai kewenangan.", viewKey: "team.view",
        children: [
          { key: "team.manage", label: "Kelola Tim", description: "Tambah, ubah, dan kelola anggota tim." },
          { key: "team.access", label: "Pengaturan Akses", description: "Mengatur jabatan dan hak akses anggota." },
        ],
      },
      { key: "outlets.view", label: "Outlet", description: "Melihat dan mengelola data outlet.", viewKey: "outlets.view" },
      { key: "schedule.view", label: "Jadwal Toko", description: "Melihat dan mengatur jadwal kunjungan outlet.", viewKey: "schedule.view" },
      {
        key: "sales_stock.view", label: "Stok Sales", description: "Melihat dan mengelola stok Sales.", viewKey: "sales_stock.view",
        children: [
          { key: "sales_stock.load", label: "Muat Stok", description: "Mengisi stok yang dibawa Sales." },
          { key: "sales_stock.return", label: "Kembalikan ke Gudang", description: "Mencatat pengembalian stok Sales." },
        ],
      },
      { key: "transactions.view", label: "Transaksi", description: "Melihat dan mengelola transaksi.", viewKey: "transactions.view" },
      {
        key: "operations.view", label: "Operasional", description: "Ringkasan dan tindakan operasional.", viewKey: "operations.view",
        children: [
          { key: "operations.travel_funds", label: "Input Uang Jalan", description: "Memberikan atau mengurangi uang jalan Sales." },
          { key: "operations.expenses", label: "Pengeluaran", description: "Melihat pengeluaran operasional Sales." },
          { key: "operations.reports", label: "Laporan Operasional", description: "Membuka laporan dari Operasional." },
          { key: "operations.export", label: "Download Excel", description: "Mengunduh rekap operasional." },
        ],
      },
      { key: "expenses.view", label: "Pengeluaran", description: "Melihat dan mengelola pengeluaran Sales.", viewKey: "expenses.view" },
      {
        key: "direct_selling.view", label: "Direct Selling", description: "Mengelola penjualan langsung dari gudang.", viewKey: "direct_selling.view",
        children: [
          { key: "direct_selling.sale", label: "Penjualan Gudang", description: "Mencatat penjualan langsung dari Gudang." },
          { key: "direct_selling.return", label: "Retur ke Gudang", description: "Mencatat barang yang dikembalikan ke Gudang." },
        ],
      },
    ],
  },
  {
    title: "Analitik",
    items: [
      {
        key: "reports.view", label: "Laporan", description: "Melihat laporan bisnis dan penjualan.", viewKey: "reports.view",
        children: [
          { key: "reports.finance", label: "Laba Rugi & Omset", description: "Melihat performa penjualan dan profit." },
          { key: "reports.receivables", label: "Piutang Outlet", description: "Melihat nilai stok titipan yang masih berada di outlet." },
          { key: "reports.export", label: "Download Excel", description: "Mengunduh laporan ke Excel." },
        ],
      },
      { key: "kpi.view", label: "KPI", description: "Melihat KPI dan penilaian kinerja.", viewKey: "kpi.view" },
    ],
  },
  {
    title: "Master",
    items: [
      { key: "products.view", label: "Master Produk", description: "Mengelola data produk bisnis.", viewKey: "products.view" },
      {
        key: "master_stock.view", label: "Master Stok", description: "Mengelola stok gudang.", viewKey: "master_stock.view",
        children: [
          { key: "master_stock.opening", label: "Stok Awal", description: "Mencatat atau mengubah stok fisik awal." },
          { key: "master_stock.incoming", label: "Stok Masuk / Distribusi", description: "Menambah stok dari produksi atau supplier." },
          { key: "master_stock.damage", label: "Barang Rusak / Musnahkan", description: "Mengurangi stok karena rusak, bocor, atau expired." },
          { key: "master_stock.reset", label: "Reset Stok Awal", description: "Mengulang setup stok awal sebelum transaksi berjalan." },
        ],
      },
      { key: "notes.view", label: "Catatan", description: "Melihat dan mengelola catatan operasional.", viewKey: "notes.view" },
    ],
  },
];

export function hasAccess(permissions: string[], key: string) {
  return permissions.includes(key);
}

export function expandLegacyManagerPermissions(saved: string[]) {
  const result = new Set(saved);
  for (const group of ACCESS_GROUPS) for (const item of group.items) {
    if (!item.children?.length) continue;
    const hasChild = item.children.some((child) => result.has(child.key));
    if (result.has(item.key) && !hasChild) item.children.forEach((child) => result.add(child.key));
    if (hasChild) result.add(item.key);
  }
  return [...result];
}

export function hasAnyAccess(permissions: string[], keys: string[]) {
  return keys.some((key) => permissions.includes(key));
}

export const MANAGED_ROUTE_PERMISSIONS: Record<string, string> = {
  "/team": "team.view",
  "/team-access": "team.access",
  "/outlets": "outlets.view",
  "/schedule": "schedule.view",
  "/sales-stock-day": "sales_stock.view",
  "/transactions": "transactions.view",
  "/operations": "operations.view",
  "/travel-funds": "operations.travel_funds",
  "/expenses": "expenses.view",
  "/reports": "reports.view",
  "/warehouse-direct-sale": "direct_selling.view",
  "/products": "products.view",
  "/master-stock": "master_stock.view",
  "/stock-opening": "master_stock.opening",
  "/admin-stock-reset": "master_stock.reset",
  "/notes": "notes.view",
};
