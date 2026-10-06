import { Link } from "@tanstack/react-router";
import { BarChart3, Building2, FileText, History, Package, Play, Store, Truck, Users, Warehouse, Wallet, CalendarDays, Settings2, ShieldCheck, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModeSwitcher } from "@/components/mode-switcher";
import type { Profile } from "@/lib/access";

type DashboardProps = { profile: Profile | null; businessName?: string | null };
type PermissionDashboardProps = DashboardProps & { permissions: string[] };

function Header({ title, subtitle }: { title: string; subtitle: string }) {
  return <header className="flex items-start justify-between gap-3"><div><div className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Sales Pouch</div><h1 className="mt-1 text-[26px] font-bold tracking-tight">{title}</h1><p className="mt-1 text-xs text-muted-foreground">{subtitle}</p></div><ModeSwitcher /></header>;
}

function MenuButton({ to, icon: Icon, label, tone = "orange" }: { to: string; icon: typeof Store; label: string; tone?: "orange" | "blue" | "purple" | "green" }) {
  const toneClass = { orange: "bg-orange-100 text-orange-700", blue: "bg-blue-100 text-blue-700", purple: "bg-purple-100 text-purple-700", green: "bg-emerald-100 text-emerald-700" }[tone];
  return <Button asChild variant="outline" className="h-[72px] rounded-2xl border-border/80 bg-card/80 px-3 shadow-sm transition-colors hover:bg-card"><Link to={to as never}><span className="flex min-w-0 items-center gap-3"><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${toneClass}`}><Icon className="h-5 w-5" /></span><span className="truncate text-left text-[14px] font-semibold leading-tight">{label}</span></span><ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" /></Link></Button>;
}

function PermissionMenu({ allowed, ...props }: { allowed: boolean } & Parameters<typeof MenuButton>[0]) {
  return allowed ? <MenuButton {...props} /> : null;
}

function OwnerSection({ title, icon: Icon, children }: { title: string; icon: typeof Package; children: React.ReactNode }) {
  return <section className="mt-6"><div className="mb-2.5 flex items-center gap-2 px-1"><Icon className="h-4 w-4 text-muted-foreground" /><h2 className="text-[12px] font-bold tracking-wide text-foreground">{title}</h2></div><div className="grid grid-cols-2 gap-2.5">{children}</div></section>;
}

function OwnerSummary() {
  return <section className="mt-4 rounded-2xl border bg-card p-3.5 shadow-sm"><div className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Ringkasan Hari Ini</div><div className="grid grid-cols-2 divide-x"><div className="px-2"><div className="text-[10px] text-muted-foreground">Outlet</div><div className="mt-0.5 text-xl font-bold">—</div><div className="text-[10px] text-muted-foreground">Outlet aktif</div></div><div className="px-3"><div className="text-[10px] text-muted-foreground">Kunjungan</div><div className="mt-0.5 text-xl font-bold">—</div><div className="text-[10px] text-muted-foreground">Hari ini</div></div></div></section>;
}

export function SuperAdminDashboard() {
  return <main className="mx-auto min-h-screen max-w-md px-5 pb-10 pt-5"><Header title="Super Admin" subtitle="Panel kontrol sistem Sales Pouch" /><section className="mt-5 rounded-2xl border bg-card p-4 shadow-sm"><div className="flex items-start gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><ShieldCheck className="h-6 w-6" /></div><div><h2 className="font-bold">Kontrol Super Admin</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Kelola akun, lisensi, promo, dan alat administrasi sistem.</p></div></div><Button asChild className="mt-4 h-12 w-full rounded-xl"><Link to="/admin">Buka Dashboard Super Admin</Link></Button></section><section className="mt-5"><div className="mb-2 px-1 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Alat Sistem</div><div className="grid grid-cols-2 gap-2.5"><MenuButton to="/admin" icon={ShieldCheck} label="Kontrol Admin" tone="orange" /><MenuButton to="/admin-stock-reset" icon={Settings2} label="Reset Stok" tone="blue" /></div></section><p className="mt-5 rounded-xl border border-dashed p-3 text-center text-xs text-muted-foreground">Gunakan tombol Mode di atas untuk menguji tampilan Owner, Manager, dan Sales.</p></main>;
}

export function OwnerDashboard({ profile, businessName }: DashboardProps) {
  return <main className="mx-auto min-h-screen max-w-md px-5 pb-10 pt-5">
    <Header title={businessName || profile?.business_name || "Owner"} subtitle="Panel utama pemilik usaha" />
    <OwnerSummary />
    <section className="mt-4"><Button asChild className="h-12 w-full rounded-2xl text-base font-semibold shadow-sm"><Link to="/visit" search={{ outlet: undefined }}><Play className="mr-2 h-5 w-5 fill-current" />Mulai Kunjungan</Link></Button></section>

    <OwnerSection title="Aktivitas Harian" icon={Play}>
      <MenuButton to="/outlets" icon={Store} label="Outlet" tone="orange" />
      <MenuButton to="/sales-stock-day" icon={Truck} label="Stok Sales" tone="blue" />
      <MenuButton to="/warehouse-direct-sale" icon={Warehouse} label="Direct Selling" tone="orange" />
      <MenuButton to="/transactions" icon={History} label="Transaksi" tone="purple" />
      <MenuButton to="/notes" icon={FileText} label="Catatan" tone="orange" />
    </OwnerSection>

    <OwnerSection title="Produk & Stok" icon={Package}>
      <MenuButton to="/products" icon={Package} label="Master Produk" tone="orange" />
      <MenuButton to="/master-stock" icon={Package} label="Stok Gudang" tone="blue" />
    </OwnerSection>

    <OwnerSection title="Laporan" icon={BarChart3}>
      <MenuButton to="/reports" icon={BarChart3} label="Laporan & Profit" tone="purple" />
    </OwnerSection>

    <OwnerSection title="Pengelolaan Usaha" icon={Settings2}>
      <MenuButton to="/team" icon={Users} label="Tim" tone="green" />
      <MenuButton to="/profile" icon={Building2} label="Profil Usaha" tone="green" />
      <MenuButton to="/operations" icon={Settings2} label="Operasional" tone="blue" />
    </OwnerSection>
  </main>;
}

export function ManagerDashboard({ businessName, permissions }: PermissionDashboardProps) {
  const can = (key: string) => permissions.includes(key);
  return <main className="mx-auto min-h-screen max-w-md px-5 pb-10 pt-5"><Header title="Manager" subtitle={businessName || "Operasional tim"} /><section className="mt-4 rounded-2xl border bg-card p-4 shadow-sm"><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-100 text-blue-700"><Users className="h-6 w-6" /></div><div><h2 className="font-bold">Panel Manager</h2><p className="text-xs text-muted-foreground">Menu ditentukan Owner melalui Jabatan & Akses.</p></div></div></section><section className="mt-5"><div className="mb-2 px-1 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Akses Saya</div><div className="grid grid-cols-2 gap-2.5"><PermissionMenu allowed={can("team")} to="/team" icon={Users} label="Manajemen Tim" tone="blue" /><PermissionMenu allowed={can("outlets")} to="/outlets" icon={Store} label="Outlet" tone="orange" /><PermissionMenu allowed={can("schedule")} to="/schedule" icon={CalendarDays} label="Jadwal Toko" tone="purple" /><PermissionMenu allowed={can("reports")} to="/reports" icon={BarChart3} label="Laporan" tone="green" /><PermissionMenu allowed={can("sales_stock")} to="/sales-stock-day" icon={Truck} label="Stok Sales" tone="orange" /><PermissionMenu allowed={can("transactions")} to="/transactions" icon={History} label="Transaksi" tone="purple" /><PermissionMenu allowed={can("travel_funds")} to="/travel-funds" icon={Wallet} label="Uang Jalan" tone="green" /><PermissionMenu allowed={can("operations")} to="/operations" icon={Settings2} label="Operasional" tone="blue" /><PermissionMenu allowed={can("direct_selling")} to="/warehouse-direct-sale" icon={Warehouse} label="Direct Selling" tone="orange" /><PermissionMenu allowed={can("products")} to="/products" icon={Package} label="Master Produk" tone="orange" /><PermissionMenu allowed={can("master_stock")} to="/master-stock" icon={Package} label="Stok Gudang" tone="blue" /><PermissionMenu allowed={can("notes")} to="/notes" icon={FileText} label="Catatan" tone="orange" /><PermissionMenu allowed={can("profile")} to="/profile" icon={Building2} label="Profil Usaha" tone="green" /><PermissionMenu allowed={can("kpi")} to="/reports" icon={BarChart3} label="KPI" tone="purple" /><PermissionMenu allowed={can("payroll")} to="/reports" icon={Wallet} label="Payroll" tone="green" /></div></section></main>;
}

export function AdminDashboard({ businessName, permissions }: PermissionDashboardProps) {
  const can = (key: string) => permissions.includes(key);
  return <main className="mx-auto min-h-screen max-w-md px-5 pb-10 pt-5"><Header title="Admin" subtitle={businessName || "Administrasi usaha"} /><section className="mt-4 rounded-2xl border bg-card p-4 shadow-sm"><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-100 text-purple-700"><ShieldCheck className="h-6 w-6" /></div><div><h2 className="font-bold">Panel Admin</h2><p className="text-xs text-muted-foreground">Menu ditentukan Owner melalui Jabatan & Akses.</p></div></div></section><section className="mt-5"><div className="mb-2 px-1 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Akses Saya</div><div className="grid grid-cols-2 gap-2.5"><PermissionMenu allowed={can("team")} to="/team" icon={Users} label="Tim" tone="blue" /><PermissionMenu allowed={can("outlets")} to="/outlets" icon={Store} label="Outlet" tone="orange" /><PermissionMenu allowed={can("schedule")} to="/schedule" icon={CalendarDays} label="Jadwal Toko" tone="purple" /><PermissionMenu allowed={can("reports")} to="/reports" icon={BarChart3} label="Laporan" tone="green" /><PermissionMenu allowed={can("sales_stock")} to="/sales-stock-day" icon={Truck} label="Stok Sales" tone="orange" /><PermissionMenu allowed={can("transactions")} to="/transactions" icon={History} label="Transaksi" tone="purple" /><PermissionMenu allowed={can("travel_funds")} to="/travel-funds" icon={Wallet} label="Uang Jalan" tone="green" /><PermissionMenu allowed={can("notes")} to="/notes" icon={FileText} label="Catatan" tone="orange" /><PermissionMenu allowed={can("operations")} to="/operations" icon={Settings2} label="Operasional" tone="blue" /><PermissionMenu allowed={can("direct_selling")} to="/warehouse-direct-sale" icon={Warehouse} label="Direct Selling" tone="orange" /><PermissionMenu allowed={can("products")} to="/products" icon={Package} label="Master Produk" tone="orange" /><PermissionMenu allowed={can("master_stock")} to="/master-stock" icon={Package} label="Stok Gudang" tone="blue" /><PermissionMenu allowed={can("profile")} to="/profile" icon={Building2} label="Profil Usaha" tone="green" /><PermissionMenu allowed={can("kpi")} to="/reports" icon={BarChart3} label="KPI" tone="purple" /><PermissionMenu allowed={can("payroll")} to="/reports" icon={Wallet} label="Payroll" tone="green" /></div></section></main>;
}

export function SalesDashboard({ businessName }: DashboardProps) {
  return <main className="mx-auto min-h-screen max-w-md px-5 pb-10 pt-5"><Header title="Sales" subtitle={businessName || "Panel kerja Sales"} /><section className="mt-4 rounded-2xl border bg-card p-4 shadow-sm"><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-100 text-orange-700"><Truck className="h-6 w-6" /></div><div><h2 className="font-bold">Panel Sales</h2><p className="text-xs text-muted-foreground">Fokus pada stok harian, kunjungan, penjualan, dan uang jalan.</p></div></div></section><section className="mt-5"><Button asChild className="h-12 w-full rounded-xl text-base font-semibold"><Link to="/visit" search={{ outlet: undefined }}><Play className="mr-2 h-5 w-5 fill-current" />Mulai Kunjungan</Link></Button></section><section className="mt-5"><div className="mb-2 px-1 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Pekerjaan Sales</div><div className="grid grid-cols-2 gap-2.5"><MenuButton to="/sales-stock-day" icon={Truck} label="Stok Sales" tone="blue" /><MenuButton to="/transactions" icon={History} label="Transaksi" tone="purple" /><MenuButton to="/travel-funds" icon={Wallet} label="Uang Jalan" tone="green" /><MenuButton to="/notes" icon={FileText} label="Catatan" tone="orange" /></div></section></main>;
}
