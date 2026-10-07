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
      const omzet = [...fieldRows, ...warehouseRows].reduce(
        (sum, row) => sum + (Number(row.total_sales) || 0) - (Number(row.discount_amount) || 0),
        0,
      );
      const visited = new Set(fieldRows.map(row => row.outlet_id).filter(Boolean)).size;

      return {
        omzet,
        transactions: fieldRows.length + warehouseRows.length,
        visited,
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
        <div className="mt-0.5 truncate text-sm font-bold text-foreground">{data ? rp(data.omzet) : "Memuat…"}</div>
      </div>
      <div>
        <div className="text-[10px] text-muted-foreground">Transaksi</div>
        <div className="mt-0.5 text-sm font-bold text-foreground">{data?.transactions ?? "—"}</div>
      </div>
      <div>
        <div className="text-[10px] text-muted-foreground">Outlet Dikunjungi</div>
        <div className="mt-0.5 text-sm font-bold text-foreground">{data?.visited ?? "—"}</div>
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
    </main>
  );
}

export function SalesDashboard({ businessName, profile }: DashboardProps) {
  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-12 pt-4">
      <Header title="Sales Field" subtitle={businessName || "Mode Kunjungan Lapangan"} />
      <SalesFinancialSummary salesId={profile?.id} />
      <div className="mt-3">
        <Button asChild className="h-12 w-full rounded-xl text-base font-semibold shadow-xs">
          <Link to="/visit" search={{ outlet: undefined }}>
            <Play className="mr-2 h-5 w-5 fill-current" />
            Mulai Kunjungan
          </Link>
        </Button>
      </div>
      <section className="mt-4 rounded-xl border bg-card p-3 shadow-xs">
        <div className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Aktivitas Sales
        </div>
        <div className="grid grid-cols-4 gap-1">
          <CompactIconMenu to="/outlets" icon={Store} label="Outlet" badgeColor="bg-amber-500/10 text-amber-600" />
          <CompactIconMenu to="/sales-stock-day" icon={Truck} label="Stok Sales" badgeColor="bg-blue-500/10 text-blue-600" />
          <CompactIconMenu to="/transactions" icon={History} label="Riwayat Nota" badgeColor="bg-purple-500/10 text-purple-600" />
          <CompactIconMenu to="/schedule" icon={CalendarDays} label="Jadwal" badgeColor="bg-sky-500/10 text-sky-600" />
          <CompactIconMenu to="/travel-funds" icon={Wallet} label="Uang Jalan" badgeColor="bg-emerald-500/10 text-emerald-600" />
          <CompactIconMenu to="/notes" icon={FileText} label="Catatan" badgeColor="bg-orange-500/10 text-orange-600" />
        </div>
      </section>
    </main>
  );
}

export function ManagerDashboard({ businessName, permissions }: PermissionDashboardProps) {
  const can = (key: string) => permissions.includes(key);
  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-12 pt-4">
      <Header title="Manager" subtitle={businessName || "Operasional Tim"} />
      <section className="mt-4 rounded-xl border bg-card p-3 shadow-xs">
        <div className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Menu Akses Manager
        </div>
        <div className="grid grid-cols-4 gap-1">
          {can("team") && <CompactIconMenu to="/team" icon={Users} label="Tim" />}
          {can("outlets") && <CompactIconMenu to="/outlets" icon={Store} label="Outlet" />}
          {can("schedule") && <CompactIconMenu to="/schedule" icon={CalendarDays} label="Jadwal" />}
          {can("reports") && <CompactIconMenu to="/reports" icon={BarChart3} label="Laporan" />}
          {can("sales_stock") && <CompactIconMenu to="/sales-stock-day" icon={Truck} label="Stok Sales" />}
          {can("transactions") && <CompactIconMenu to="/transactions" icon={History} label="Transaksi" />}
          {can("travel_funds") && <CompactIconMenu to="/travel-funds" icon={Wallet} label="Uang Jalan" />}
          {can("operations") && <CompactIconMenu to="/operations" icon={Settings2} label="Operasional" />}
        </div>
      </section>
    </main>
  );
}

export function AdminDashboard({ businessName, permissions }: PermissionDashboardProps) {
  const can = (key: string) => permissions.includes(key);
  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-12 pt-4">
      <Header title="Admin" subtitle={businessName || "Administrasi Usaha"} />
      <section className="mt-4 rounded-xl border bg-card p-3 shadow-xs">
        <div className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Menu Akses Admin
        </div>
        <div className="grid grid-cols-4 gap-1">
          {can("team") && <CompactIconMenu to="/team" icon={Users} label="Tim" />}
          {can("outlets") && <CompactIconMenu to="/outlets" icon={Store} label="Outlet" />}
          {can("schedule") && <CompactIconMenu to="/schedule" icon={CalendarDays} label="Jadwal" />}
          {can("reports") && <CompactIconMenu to="/reports" icon={BarChart3} label="Laporan" />}
          {can("sales_stock") && <CompactIconMenu to="/sales-stock-day" icon={Truck} label="Stok Sales" />}
          {can("transactions") && <CompactIconMenu to="/transactions" icon={History} label="Transaksi" />}
          {can("travel_funds") && <CompactIconMenu to="/travel-funds" icon={Wallet} label="Uang Jalan" />}
          {can("notes") && <CompactIconMenu to="/notes" icon={FileText} label="Catatan" />}
        </div>
      </section>
    </main>
  );
}


// Ringkasan keuangan Sales: uang jalan, penjualan, hasil tagihan masuk, dan target setoran.
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

  const loadingText = isLoading ? "Memuat…" : isError ? "—" : null;

  return (
    <section className="mt-3 rounded-xl border bg-card p-3 shadow-xs">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Keuangan Sales Hari Ini
          </div>
          <div className="text-[10px] text-muted-foreground">
            Acuan saat melakukan setoran sales
          </div>
        </div>
        <Wallet className="h-4 w-4 text-emerald-600" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border bg-emerald-500/5 p-2.5">
          <div className="text-[10px] text-muted-foreground">Uang Jalan</div>
          <div className="mt-0.5 text-sm font-bold text-foreground">
            {loadingText ?? rp(Number(data?.travel_balance) || 0)}
          </div>
        </div>

        <div className="rounded-lg border bg-blue-500/5 p-2.5">
          <div className="text-[10px] text-muted-foreground">Penjualan</div>
          <div className="mt-0.5 text-sm font-bold text-foreground">
            {loadingText ?? rp(Number(data?.sales_value_today) || 0)}
          </div>
        </div>

        <div className="rounded-lg border bg-amber-500/5 p-2.5">
          <div className="text-[10px] text-muted-foreground">Hasil Tagihan Masuk</div>
          <div className="mt-0.5 text-sm font-bold text-foreground">
            {loadingText ?? rp(Number(data?.collected_today) || 0)}
          </div>
        </div>

        <div className="rounded-lg border bg-purple-500/5 p-2.5">
          <div className="text-[10px] text-muted-foreground">Target Setoran</div>
          <div className="mt-0.5 text-sm font-bold text-foreground">
            {loadingText ?? rp(Number(data?.deposit_target) || 0)}
          </div>
        </div>
      </div>

      <div className="mt-2 rounded-lg bg-muted/50 px-2.5 py-2 text-[10px] leading-relaxed text-muted-foreground">
        Target setoran mengikuti <b className="text-foreground">hasil tagihan yang sudah masuk</b>,
        bukan seluruh nilai piutang yang belum dibayar.
      </div>
    </section>
  );
}

// Sales mode access: outlet, stock, history, schedule, travel funds, and notes.
