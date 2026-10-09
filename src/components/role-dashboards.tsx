import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  BarChart3,
  Building2,
  FileText,
  History,
  Package,
  Play,
  Store,
  Truck,
  Users,
  Warehouse,
  Wallet,
  CalendarDays,
  Settings2,
  ShieldCheck,
  ChevronRight,
  ShoppingCart,
  LockKeyhole,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModeSwitcher } from "@/components/mode-switcher";
import type { Profile } from "@/lib/access";

type DashboardProps = { profile: Profile | null; businessName?: string | null };
type PermissionDashboardProps = DashboardProps & { permissions: string[] };

function Header({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="flex items-center justify-between border-b pb-3.5">
      <div className="min-w-0">
        <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Sales Pouch Pro
        </span>
        <h1 className="truncate text-xl font-bold tracking-tight text-foreground">{title}</h1>
        <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <ModeSwitcher />
    </header>
  );
}

// Tombol Grid 4-Kolom Kompak (Modern, Ringkas, No-Scroll)
function CompactIconMenu({
  to,
  icon: Icon,
  label,
  badgeColor = "text-primary bg-primary/10",
}: {
  to: string;
  icon: typeof Store;
  label: string;
  badgeColor?: string;
}) {
  return (
    <Link
      to={to as never}
      className="group flex flex-col items-center justify-center rounded-xl p-2 text-center transition-all hover:bg-muted/60 active:scale-95"
    >
      <div
        className={`flex h-11 w-11 items-center justify-center rounded-xl transition-transform group-hover:scale-105 ${badgeColor}`}
      >
        <Icon className="h-5 w-5" />
      </div>
      <span className="mt-1.5 text-[11px] font-medium leading-tight text-foreground line-clamp-2">
        {label}
      </span>
    </Link>
  );
}

// Ringkasan Statistik Harian yang Ramping
function CompactSummary({ ownerId }: { ownerId?: string }) {
  const { data } = useQuery({
    queryKey: ["owner-dashboard-summary", ownerId],
    enabled: !!ownerId,
    queryFn: async () => {
      // Fast path: one server-side aggregate. Fallback keeps the dashboard
      // working if the new RPC has not reached the database yet.
      const { data: summary, error: rpcError } = await (supabase as any).rpc("get_owner_dashboard_summary", {
        _owner_id: ownerId!,
      });

      if (!rpcError && summary?.[0]) {
        return summary[0];
      }

      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();

      const [{ data: txs, error: txError }, { data: wds, error: wdsError }] = await Promise.all([
        supabase
          .from("transactions")
          .select("outlet_id,total_sales,discount_amount")
          .eq("user_id", ownerId!)
          .gte("visit_date", start)
          .lt("visit_date", end),
        supabase
          .from("warehouse_direct_sales")
          .select("total_sales,discount_amount")
          .eq("owner_id", ownerId!)
          .gte("sale_date", start)
          .lt("sale_date", end),
      ]);

      if (txError) throw txError;
      if (wdsError) throw wdsError;

      const fieldRows = txs ?? [];
      const warehouseRows = wds ?? [];
      return {
        omzet: [...fieldRows, ...warehouseRows].reduce(
          (sum, row) => sum + (Number(row.total_sales) || 0) - (Number(row.discount_amount) || 0),
          0,
        ),
        transactions: fieldRows.length + warehouseRows.length,
        visited: new Set(fieldRows.map(row => row.outlet_id).filter(Boolean)).size,
      };
    },
    staleTime: 30_000,
  });

  const rp = (value: number) =>
    new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);

  return (
    <section className="mt-3 grid grid-cols-3 divide-x rounded-xl border bg-card/60 p-2 text-center shadow-xs">
      <div>
        <div className="text-[10px] text-muted-foreground">Omset Hari Ini</div>
        <div className="mt-0.5 truncate text-sm font-bold text-foreground">{data ? rp(Number(data.omzet) || 0) : "Memuat…"}</div>
      </div>
      <div>
        <div className="text-[10px] text-muted-foreground">Transaksi</div>
        <div className="mt-0.5 text-sm font-bold text-foreground">{data ? Number(data.transactions) || 0 : "—"}</div>
      </div>
      <div>
        <div className="text-[10px] text-muted-foreground">Outlet Dikunjungi</div>
        <div className="mt-0.5 text-sm font-bold text-foreground">{data ? Number(data.visited) || 0 : "—"}</div>
      </div>
    </section>
  );
}

// -------------------------------------------------------------
// OWNER DASHBOARD
// -------------------------------------------------------------
export function OwnerDashboard({ profile, businessName }: DashboardProps) {
  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-12 pt-4">
      <Header
        title={businessName || profile?.business_name || "Owner"}
        subtitle="Kendali Operasional Lapangan"
      />

      <CompactSummary ownerId={profile?.id} />

      {/* Tombol Utama (Call to Action Terbesar) */}
      <div className="mt-3">
        <Button asChild className="h-11 w-full rounded-xl text-sm font-semibold shadow-xs">
          <Link to="/visit" search={{ outlet: undefined }}>
            <Play className="mr-2 h-4 w-4 fill-current" />
            Mulai Kunjungan Lapangan
          </Link>
        </Button>
      </div>

      {/* Aksi Cepat Operasional Harian */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Link
          to="/transactions"
          className="flex items-center gap-2 rounded-lg border bg-card p-2.5 transition-colors hover:bg-muted/50"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-500/10 text-purple-600">
            <ShoppingCart className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold leading-tight">Penjualan</div>
            <div className="text-[10px] text-muted-foreground">Nota & Kasir</div>
          </div>
        </Link>

        <Link
          to="/sales-stock-day"
          className="flex items-center gap-2 rounded-lg border bg-card p-2.5 transition-colors hover:bg-muted/50"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600">
            <Truck className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold leading-tight">Stok Sales</div>
            <div className="text-[10px] text-muted-foreground">Muat & Setor</div>
          </div>
        </Link>

        <Link
          to="/outlets"
          className="flex items-center gap-2 rounded-lg border bg-card p-2.5 transition-colors hover:bg-muted/50"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
            <Store className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold leading-tight">Outlet</div>
            <div className="text-[10px] text-muted-foreground">Data Warung</div>
          </div>
        </Link>
      </div>

      {/* Menu Master & Manajemen (4-Kolom Rapi & Muat di Layar) */}
      <section className="mt-4 rounded-xl border bg-card p-3 shadow-xs">
        <div className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Manajemen & Data Master
        </div>
        <div className="grid grid-cols-4 gap-1">
          <CompactIconMenu
            to="/products"
            icon={Package}
            label="Produk"
            badgeColor="bg-amber-500/10 text-amber-600"
          />
          <CompactIconMenu
            to="/master-stock"
            icon={Warehouse}
            label="Gudang"
            badgeColor="bg-blue-500/10 text-blue-600"
          />
          <CompactIconMenu
            to="/warehouse-direct-sale"
            icon={History}
            label="Direct Sale"
            badgeColor="bg-emerald-500/10 text-emerald-600"
          />
          <CompactIconMenu
            to="/reports"
            icon={BarChart3}
            label="Laporan"
            badgeColor="bg-purple-500/10 text-purple-600"
          />
          <CompactIconMenu
            to="/team"
            icon={Users}
            label="Tim Sales"
            badgeColor="bg-sky-500/10 text-sky-600"
          />
          <CompactIconMenu
            to="/operations"
            icon={Settings2}
            label="Operasional"
            badgeColor="bg-slate-500/10 text-slate-600"
          />
          <CompactIconMenu
            to="/notes"
            icon={FileText}
            label="Catatan"
            badgeColor="bg-orange-500/10 text-orange-600"
          />
          <CompactIconMenu
            to="/profile"
            icon={Building2}
            label="Profil"
            badgeColor="bg-teal-500/10 text-teal-600"
          />
        </div>
      </section>
    </main>
  );
}

// -------------------------------------------------------------
// ROLE DASHBOARD LAINNYA (TETAP KOMPAK & CEPAT)
// -------------------------------------------------------------
export function SuperAdminDashboard() {
  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-10 pt-4">
      <Header title="Super Admin" subtitle="Panel Kontrol Pusat" />
      <section className="mt-4 rounded-xl border bg-card p-4 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold">Kontrol Super Admin</h2>
            <p className="text-xs text-muted-foreground">Kelola lisensi, tenant, dan promo.</p>
          </div>
        </div>
        <Button asChild className="mt-3 h-10 w-full rounded-lg text-xs">
          <Link to="/admin">Buka Dashboard Super Admin</Link>
        </Button>
      </section>

      {/* Submenu Operasional — khusus Owner */}
      <section className="mt-4 rounded-xl border bg-card p-3 shadow-xs">
        <div className="mb-2 flex items-center gap-2 px-1">
          <Wallet className="h-4 w-4 text-slate-600" />
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Operasional</div>
            <div className="text-[10px] text-muted-foreground">Pengelolaan dana operasional Sales</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Link
            to="/operations"
            className="rounded-lg border p-3 transition-colors hover:bg-muted/50"
          >
            <div className="text-xs font-semibold">Ringkasan Operasional</div>
            <div className="mt-0.5 text-[10px] text-muted-foreground">Saldo & rekap Sales</div>
          </Link>
          <Link
            to="/travel-funds"
            className="rounded-lg border p-3 transition-colors hover:bg-muted/50"
          >
            <div className="text-xs font-semibold">Input Uang Jalan Sales</div>
            <div className="mt-0.5 text-[10px] text-muted-foreground">Berikan atau kurangi uang jalan</div>
          </Link>
        </div>
      </section>
    </main>
  );
}

export function SalesDashboard({ businessName, profile, salesUserId }: DashboardProps & { salesUserId?: string }) {
  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-12 pt-4">
      <Header title="Sales Field" subtitle={businessName || "Mode Kunjungan Lapangan"} />

      <div className="mt-4">
        <Button asChild className="h-12 w-full rounded-xl text-sm font-semibold shadow-sm">
          <Link to="/visit" search={{ outlet: undefined }}>
            <Play className="mr-2 h-5 w-5 fill-current" />
            Mulai Kunjungan
          </Link>
        </Button>
      </div>

      <SalesFinancialSummary salesId={salesUserId ?? profile?.id} />

      <SalesStockSummary salesId={salesUserId} />

      <section className="mt-4 rounded-xl border bg-card p-3 shadow-xs">
        <div className="mb-2.5 flex items-center justify-between px-1">
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Menu</div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Link to="/outlets" className="rounded-lg border bg-amber-500/5 p-3 transition-colors hover:bg-muted/50 active:scale-[0.99]">
            <Store className="h-4 w-4 text-amber-600" />
            <div className="mt-2 text-xs font-semibold text-foreground">Outlet</div>
          </Link>
          <Link to="/sales-stock-day" className="rounded-lg border bg-blue-500/5 p-3 transition-colors hover:bg-muted/50 active:scale-[0.99]">
            <Truck className="h-4 w-4 text-blue-600" />
            <div className="mt-2 text-xs font-semibold text-foreground">Stok Sales</div>
          </Link>
          <Link to="/transactions" className="rounded-lg border bg-purple-500/5 p-3 transition-colors hover:bg-muted/50 active:scale-[0.99]">
            <History className="h-4 w-4 text-purple-600" />
            <div className="mt-2 text-xs font-semibold text-foreground">Riwayat Nota</div>
          </Link>
          <Link to="/schedule" className="rounded-lg border bg-sky-500/5 p-3 transition-colors hover:bg-muted/50 active:scale-[0.99]">
            <CalendarDays className="h-4 w-4 text-sky-600" />
            <div className="mt-2 text-xs font-semibold text-foreground">Jadwal</div>
          </Link>
          <Link to="/notes" className="rounded-lg border bg-orange-500/5 p-3 transition-colors hover:bg-muted/50 active:scale-[0.99]">
            <FileText className="h-4 w-4 text-orange-600" />
            <div className="mt-2 text-xs font-semibold text-foreground">Catatan</div>
          </Link>
        </div>
      </section>
    </main>
  );
}

function PermissionIconMenu({
  to,
  icon: Icon,
  label,
  permission,
  permissions,
  badgeColor = "text-primary bg-primary/10",
}: {
  to: string;
  icon: typeof Store;
  label: string;
  permission: string;
  permissions: string[];
  badgeColor?: string;
}) {
  const allowed = permissions.includes(permission);

  if (!allowed) {
    return (
      <div
        aria-disabled="true"
        title="Akses dikunci Owner"
        className="relative flex flex-col items-center justify-center rounded-xl p-2 text-center opacity-45"
      >
        <div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <Icon className="h-5 w-5" />
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-card bg-amber-100 text-amber-700">
            <LockKeyhole className="h-2.5 w-2.5" />
          </span>
        </div>
        <span className="mt-1.5 text-[11px] font-medium leading-tight text-muted-foreground line-clamp-2">{label}</span>
      </div>
    );
  }

  return <CompactIconMenu to={to} icon={Icon} label={label} badgeColor={badgeColor} />;
}

function PermissionDashboardMenu({ permissions }: { permissions: string[] }) {
  const items = [
    { to: "/products", icon: Package, label: "Produk", permission: "products.view", badgeColor: "bg-amber-500/10 text-amber-600" },
    { to: "/master-stock", icon: Warehouse, label: "Gudang", permission: "master_stock.view", badgeColor: "bg-blue-500/10 text-blue-600" },
    { to: "/warehouse-direct-sale", icon: History, label: "Direct Sale", permission: "direct_selling.view", badgeColor: "bg-emerald-500/10 text-emerald-600" },
    { to: "/reports", icon: BarChart3, label: "Laporan", permission: "reports.view", badgeColor: "bg-purple-500/10 text-purple-600" },
    { to: "/team", icon: Users, label: "Tim Sales", permission: "team.view", badgeColor: "bg-sky-500/10 text-sky-600" },
    { to: "/operations", icon: Settings2, label: "Operasional", permission: "operations.view", badgeColor: "bg-slate-500/10 text-slate-600" },
    { to: "/travel-funds", icon: Wallet, label: "Uang Jalan", permission: "travel_funds.view", badgeColor: "bg-orange-500/10 text-orange-600" },
    { to: "/expenses", icon: FileText, label: "Pengeluaran", permission: "expenses.view", badgeColor: "bg-rose-500/10 text-rose-600" },
    { to: "/notes", icon: FileText, label: "Catatan", permission: "notes.view", badgeColor: "bg-orange-500/10 text-orange-600" },
    { to: "/profile", icon: Building2, label: "Profil", permission: "profile.view", badgeColor: "bg-teal-500/10 text-teal-600" },
  ];

  return (
    <section className="mt-4 rounded-xl border bg-card p-3 shadow-xs">
      <div className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        Manajemen & Data Master
      </div>
      <div className="grid grid-cols-4 gap-1">
        {items.map((item) => (
          <PermissionIconMenu key={item.permission} {...item} permissions={permissions} />
        ))}
      </div>
    </section>
  );
}

function PermissionQuickActions({ permissions }: { permissions: string[] }) {
  const items = [
    { to: "/transactions", icon: ShoppingCart, label: "Penjualan", hint: "Nota & Kasir", permission: "transactions.view", color: "bg-purple-500/10 text-purple-600" },
    { to: "/sales-stock-day", icon: Truck, label: "Stok Sales", hint: "Muat & Setor", permission: "sales_stock.view", color: "bg-blue-500/10 text-blue-600" },
    { to: "/outlets", icon: Store, label: "Outlet", hint: "Data Warung", permission: "outlets.view", color: "bg-amber-500/10 text-amber-600" },
  ];

  return (
    <div className="mt-3 grid grid-cols-3 gap-2">
      {items.map((item) => {
        const allowed = permissions.includes(item.permission);
        if (!allowed) {
          return (
            <div key={item.permission} aria-disabled="true" className="relative flex items-center gap-2 rounded-lg border bg-muted/40 p-2.5 opacity-45">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <item.icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold leading-tight">{item.label}</div>
                <div className="text-[10px] text-muted-foreground">🔒 Terkunci</div>
              </div>
            </div>
          );
        }
        return (
          <Link key={item.permission} to={item.to as never} className="flex items-center gap-2 rounded-lg border bg-card p-2.5 transition-colors hover:bg-muted/50">
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${item.color}`}>
              <item.icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold leading-tight">{item.label}</div>
              <div className="text-[10px] text-muted-foreground">{item.hint}</div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function RolePermissionDashboard({
  roleTitle,
  subtitle,
  permissions,
}: {
  roleTitle: string;
  subtitle: string;
  permissions: string[];
}) {
  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-12 pt-4">
      <Header title={roleTitle} subtitle={subtitle} />

      <section className="mt-3 rounded-xl border bg-card/60 p-3 shadow-xs">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <div>
            <div className="text-xs font-semibold">Akses Menu</div>
            <div className="text-[10px] text-muted-foreground">Menu default mengikuti jabatan. Owner dapat mengunci atau membuka menu dari Pengaturan Akses.</div>
          </div>
        </div>
      </section>

      <PermissionQuickActions permissions={permissions} />
      <PermissionDashboardMenu permissions={permissions} />
    </main>
  );
}

export function ManagerDashboard({ businessName, profile, permissions }: PermissionDashboardProps) {
  const subtitle = profile?.display_name
    ? `${profile.display_name} • Manajer Distribusi`
    : "Supervisi Distribusi & Tim Sales";

  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-12 pt-4">
      <Header title={businessName || "Manajer Area"} subtitle={subtitle} />
      <section className="mt-3 rounded-xl border border-blue-200/80 bg-blue-50/40 p-3 shadow-xs">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-blue-700" />
          <div>
            <div className="text-xs font-bold text-blue-900">Dashboard Supervisi Manajer</div>
            <div className="text-[10px] text-blue-700">Hak akses menu dan operasional dikontrol oleh Owner usaha.</div>
          </div>
        </div>
      </section>
      <PermissionQuickActions permissions={permissions} />
      <PermissionDashboardMenu permissions={permissions} />
    </main>
  );
}

export function AdminDashboard({ businessName, profile, permissions }: PermissionDashboardProps) {
  const subtitle = profile?.display_name
    ? `${profile.display_name} • Administrasi & Gudang`
    : "Pengelolaan Data & Pergudangan";

  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-12 pt-4">
      <Header title={businessName || "Admin Operasional"} subtitle={subtitle} />
      <section className="mt-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3 shadow-xs">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-slate-700" />
          <div>
            <div className="text-xs font-bold text-slate-900">Dashboard Administrasi</div>
            <div className="text-[10px] text-slate-600">Akses input barang, nota, dan pencatatan sesuai kewenangan dari Owner.</div>
          </div>
        </div>
      </section>
      <PermissionQuickActions permissions={permissions} />
      <PermissionDashboardMenu permissions={permissions} />
    </main>
  );
}


// Ringkasan stok yang sedang dibawa Sales.
function SalesStockSummary({ salesId }: { salesId?: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["sales-dashboard-stock-summary", salesId],
    enabled: !!salesId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_sales_current_stock", {
        _sales_user_id: salesId!,
      });
      if (error) throw error;
      return (data ?? []) as { product_id: string; quantity: number }[];
    },
    staleTime: 5_000,
  });

  const total = (data ?? []).reduce((sum, row) => sum + (Number(row.quantity) || 0), 0);

  return (
    <section className="mt-3 rounded-xl border border-blue-200 bg-blue-50/50 p-3 shadow-xs">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-blue-800">Stok Dibawa</div>
          <div className="mt-0.5 text-[10px] text-muted-foreground">Stok yang saat ini ada di tangan Anda</div>
        </div>
        <Truck className="h-4 w-4 text-blue-700" />
      </div>
      <div className="mt-2 text-xl font-bold text-foreground">
        {isLoading ? "…" : isError ? "—" : `${total.toLocaleString("id-ID")} pcs`}
      </div>
      {!isLoading && !isError && total === 0 && (
        <div className="mt-1 text-[10px] text-muted-foreground">Belum ada stok yang dimuat ke Sales.</div>
      )}
    </section>
  );
}

// Ringkasan informasi Sales hari ini.
function SalesFinancialSummary({ salesId }: { salesId?: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["sales-dashboard-financial-summary", salesId],
    enabled: !!salesId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_sales_dashboard_financial_summary", {
        _sales_id: salesId!,
      });
      if (error) throw error;
      return data?.[0] ?? null;
    },
    staleTime: 15_000,
  });

  const rp = (value: number) =>
    new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(value);

  const value = (raw: unknown, format = false) => {
    if (isLoading) return "…";
    if (isError) return "—";
    return format ? rp(Number(raw) || 0) : String(Number(raw) || 0);
  };

  return (
    <section className="mt-3 rounded-xl border bg-card p-3 shadow-xs">
      <div className="mb-2.5 flex items-center justify-between">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Ringkasan Hari Ini
          </div>
          <div className="text-[10px] text-muted-foreground">
            Target berdasarkan jadwal hari ini
          </div>
        </div>
        <CalendarDays className="h-4 w-4 text-primary" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border bg-emerald-500/5 p-2.5">
          <div className="text-[10px] font-medium text-muted-foreground">Uang Jalan</div>
          <div className="mt-1 truncate text-sm font-bold text-foreground">{value(data?.travel_balance, true)}</div>
        </div>

        <div className="rounded-lg border bg-blue-500/5 p-2.5">
          <div className="text-[10px] font-medium text-muted-foreground">Jumlah Outlet</div>
          <div className="mt-1 text-sm font-bold text-foreground">{value(data?.scheduled_outlets_today)} toko</div>
        </div>

        <div className="rounded-lg border bg-purple-500/5 p-2.5">
          <div className="text-[10px] font-medium text-muted-foreground">Target Tagihan</div>
          <div className="mt-1 truncate text-sm font-bold text-foreground">{value(data?.scheduled_bill_target, true)}</div>
        </div>

        <div className="rounded-lg border bg-amber-500/5 p-2.5">
          <div className="text-[10px] font-medium text-muted-foreground">Nilai Tagihan</div>
          <div className="mt-1 truncate text-sm font-bold text-foreground">{value(data?.collected_today, true)}</div>
          <div className="mt-0.5 text-[9px] text-muted-foreground">sudah tertagih</div>
        </div>
      </div>
    </section>
  );
}

// Sales mode access: outlet, stock, history, schedule, travel funds, and notes.
