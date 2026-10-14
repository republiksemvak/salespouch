import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getAdminUsers, getActiveAnnouncement, saveAnnouncement, setAnnouncementActive, getSupportConfig, saveSupportConfig, getDatabaseMetrics } from "@/lib/admin.functions";
import { supabase } from "@/integrations/supabase/client";
import {
  BarChart3,
  Building2,
  Database,
  HardDrive,
  Activity,
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
  ChevronDown,
  ChevronUp,
  Crown,
  Sparkles,
  AlertTriangle,
  ShoppingCart,
  LockKeyhole,
  RotateCcw,
  Megaphone,
  MessageCircle,
  Headphones,
  Clock,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModeSwitcher } from "@/components/mode-switcher";
import { hasPremiumAccess, type Profile } from "@/lib/access";

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

function OwnerLicenseCard({ profile }: { profile: Profile | null }) {
  const licenseUntil = profile?.license_until;

  const isPremium = Boolean(
    licenseUntil && new Date(licenseUntil).getTime() > Date.now(),
  );

  const expiryFormatted = licenseUntil
    ? new Date(licenseUntil).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  return (
    <div className="mt-2.5 flex items-center justify-between rounded-xl border bg-card/60 px-3 py-2 text-xs shadow-2xs">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
            isPremium
              ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {isPremium ? "Premium" : "Freemium"}
        </span>

        <span className="truncate text-[11px] text-muted-foreground">
          {isPremium && expiryFormatted
            ? `Berakhir sampai tgl ${expiryFormatted}`
            : "Akses Gratis"}
        </span>
      </div>

      <Link
        to="/license"
        className="ml-2 shrink-0 text-[11px] font-semibold text-primary hover:underline"
      >
        {isPremium ? "Perpanjang" : "Upgrade"}
      </Link>
    </div>
  );
}

// -------------------------------------------------------------
// OWNER DASHBOARD
// -------------------------------------------------------------

function OwnerSupportFloatingButton({ profile, businessName }: DashboardProps) {
  const fetchSupport = useServerFn(getSupportConfig);
  const { data: config } = useQuery({
    queryKey: ["app-support-config-public"],
    queryFn: () => fetchSupport(),
    staleTime: 60_000,
  });

  if (!config || !config.is_active || !config.whatsapp_number) return null;

  const cleanNumber = String(config.whatsapp_number).replace(/\D/g, "");
  const textMessage = encodeURIComponent(
    `Halo ${config.support_name || "CS Sales Pouch Pro"}, saya butuh bantuan:\n\n` +
    `• Email: ${profile?.user_email || "-"}\n` +
    `• Nama Usaha: ${businessName || profile?.business_name || "-"}\n` +
    `• Status Akun: ${hasPremiumAccess(profile) ? "Premium" : "Freemium"}\n\n` +
    "Kendala / Pertanyaan:"
  );
  const waUrl = `https://wa.me/${cleanNumber}?text=${textMessage}`;

  return (
    <a
      href={waUrl}
      target="_blank"
      rel="noreferrer"
      aria-label="Hubungi Bantuan WhatsApp"
      className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-emerald-600 px-3.5 py-2.5 text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
    >
      <MessageCircle className="h-5 w-5 fill-current" />
      <span className="text-xs font-bold tracking-wide">Bantuan CS</span>
    </a>
  );
}

export function OwnerDashboard({ profile, businessName }: DashboardProps) {
  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-12 pt-4">
      <Header
        title={businessName || profile?.business_name || "Owner"}
        subtitle="Kendali Operasional Lapangan"
      />

      <OwnerAnnouncementBanner />

      <OwnerLicenseCard profile={profile} />

      {hasPremiumAccess(profile) ? (
        <CompactSummary ownerId={profile?.id} />
      ) : (
        <section className="mt-3 rounded-xl border border-dashed bg-card/60 p-3 text-sm">
          <div className="flex items-center gap-2 font-semibold"><LockKeyhole className="h-4 w-4" /> Ringkasan Omset Premium</div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">Ringkasan omset dan analisis keuangan tersedia pada paket Premium.</p>
          <Link to="/reports" className="mt-2 inline-block text-xs font-semibold text-primary underline">Lihat opsi upgrade</Link>
        </section>
      )}

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

      <OwnerSupportFloatingButton profile={profile} businessName={businessName} />
    </main>
  );
}

// -------------------------------------------------------------
// ROLE DASHBOARD LAINNYA (TETAP KOMPAK & CEPAT)
// -------------------------------------------------------------
function OwnerAnnouncementBanner() {
  const [dismissed, setDismissed] = useState(false);
  const fetchActive = useServerFn(getActiveAnnouncement);
  const { data: announcement } = useQuery({
    queryKey: ["active-announcement"],
    queryFn: async () => {
      try {
        return await fetchActive();
      } catch {
        return null;
      }
    },
    staleTime: 60_000,
  });

  const [locallyDismissed, setLocallyDismissed] = useState(false);
  useEffect(() => {
    if (!announcement || typeof window === "undefined") return;
    setLocallyDismissed(
      localStorage.getItem("sp_dismiss_announcement_" + announcement.id) === "true",
    );
  }, [announcement?.id]);

  if (!announcement || !announcement.is_active || dismissed || locallyDismissed) return null;
  const bgStyle =
    announcement.type === "important" || announcement.type === "danger"
      ? "border-rose-500/30 bg-rose-500/10 text-rose-950 dark:text-rose-200"
      : announcement.type === "warning"
      ? "border-amber-500/30 bg-amber-500/10 text-amber-950 dark:text-amber-200"
      : "border-primary/30 bg-primary/10 text-foreground";

  return (
    <div className={"mt-3 rounded-xl border p-3 text-xs shadow-xs transition-all " + bgStyle}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2.5">
          <div className="mt-0.5 rounded-full bg-background/80 p-1 text-primary shadow-xs">
            <Megaphone className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <div className="font-bold leading-tight">{announcement.title}</div>
            <div className="mt-1 whitespace-pre-line text-[11px] leading-relaxed opacity-90">{announcement.content}</div>
          </div>
        </div>
        <button type="button" onClick={() => {
          setDismissed(true);
          setLocallyDismissed(true);
          localStorage.setItem("sp_dismiss_announcement_" + announcement.id, "true");
        }} className="shrink-0 p-1 text-muted-foreground hover:text-foreground" aria-label="Tutup">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function DatabaseMetricsCard() {
  const fetchMetrics = useServerFn(getDatabaseMetrics);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-database-metrics"],
    queryFn: () => fetchMetrics(),
    staleTime: 60_000,
  });

  if (isLoading) {
    return <div className="mt-3 animate-pulse rounded-xl border bg-card p-4 text-center text-xs text-muted-foreground">Memuat metrik database…</div>;
  }

  if (error || !data) {
    return (
      <div className="mt-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-xs text-destructive">
        <div className="font-semibold">Gagal memuat metrik database</div>
        <p className="mt-1 break-words">{(error as Error | null)?.message || "Data tidak tersedia."}</p>
        <Button variant="outline" size="sm" className="mt-3 h-8" onClick={() => refetch()}>Coba Lagi</Button>
      </div>
    );
  }

  const largestTenant = data.top_tenants?.[0];

  return (
    <section className="mt-3 space-y-4 rounded-xl border bg-card p-3.5 shadow-xs">
      <div className="flex items-center justify-between gap-2 border-b pb-2">
        <div className="flex min-w-0 items-center gap-2">
          <Database className="h-4 w-4 shrink-0 text-primary" />
          <h2 className="text-xs font-bold text-foreground">Kapasitas & Beban Database</h2>
        </div>
        <Button variant="ghost" size="sm" className="h-7 shrink-0 text-[11px]" disabled={isFetching} onClick={() => refetch()}>
          {isFetching ? "Memuat…" : "Segarkan"}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-muted/40 p-2.5">
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><HardDrive className="h-3.5 w-3.5" />Total Ukuran DB</div>
          <p className="mt-1 font-mono text-lg font-bold text-foreground">{data.total_db_size}</p>
          <p className="text-[10px] text-muted-foreground">{Number(data.total_db_bytes || 0).toLocaleString("id-ID")} byte</p>
        </div>
        <div className="rounded-lg bg-muted/40 p-2.5">
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><Activity className="h-3.5 w-3.5" />Koneksi Aktif</div>
          <p className="mt-1 font-mono text-lg font-bold text-foreground">{Number(data.active_connections || 0).toLocaleString("id-ID")}</p>
          <p className="text-[10px] text-muted-foreground">koneksi PostgreSQL aktif</p>
        </div>
      </div>

      <div>
        <h3 className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Tabel Paling Banyak Memakai Space</h3>
        <div className="divide-y rounded-lg border bg-background/50 text-xs">
          {(data.tables ?? []).map((table) => (
            <div key={table.table_name} className="flex items-center justify-between gap-3 px-2.5 py-2">
              <div className="min-w-0"><div className="truncate font-mono text-foreground">{table.table_name}</div><div className="text-[10px] text-muted-foreground">~{Number(table.row_estimate || 0).toLocaleString("id-ID")} baris</div></div>
              <span className="shrink-0 font-mono font-semibold text-foreground">{table.total_size}</span>
            </div>
          ))}
          {(data.tables ?? []).length === 0 && <div className="p-3 text-center text-xs text-muted-foreground">Belum ada statistik tabel.</div>}
        </div>
      </div>

      <div>
        <h3 className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Top 5 Tenant Berdasarkan Transaksi</h3>
        <div className="space-y-2">
          {(data.top_tenants ?? []).map((tenant, index) => (
            <div key={tenant.owner_id} className="flex items-center justify-between gap-3 rounded-lg border bg-background/50 px-2.5 py-2">
              <div className="flex min-w-0 items-start gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">{index + 1}</span><div className="min-w-0"><div className="truncate text-xs font-semibold text-foreground">{tenant.company_name || "Tanpa Nama"}</div><div className="truncate text-[10px] text-muted-foreground">{tenant.user_email || "Email tidak tersedia"}</div></div></div>
              <div className="shrink-0 text-right"><div className="text-xs font-bold text-foreground">{Number(tenant.total_transactions || 0).toLocaleString("id-ID")} transaksi</div><div className="text-[10px] text-muted-foreground">{Number(tenant.total_outlets || 0).toLocaleString("id-ID")} outlet</div></div>
            </div>
          ))}
          {(data.top_tenants ?? []).length === 0 && <div className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">Belum ada data tenant.</div>}
        </div>
      </div>
    </section>
  );
}

export function SuperAdminDashboard({ embedded = false }: { embedded?: boolean } = {}) {
  const qc = useQueryClient();
  const getUsers = useServerFn(getAdminUsers);
  const fetchActive = useServerFn(getActiveAnnouncement);
  const postAnnouncement = useServerFn(saveAnnouncement);
  const toggleActive = useServerFn(setAnnouncementActive);
  const fetchSupport = useServerFn(getSupportConfig);
  const updateSupport = useServerFn(saveSupportConfig);

  const [openAnnouncement, setOpenAnnouncement] = useState(false);
  const [openSupport, setOpenSupport] = useState(false);

  const { data: usersData, isLoading: loadingUsers } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => getUsers({}),
  });
  const { data: activeAnnouncement, refetch: refetchAnnouncement } = useQuery({
    queryKey: ["active-announcement"],
    queryFn: async () => {
      try {
        return await fetchActive();
      } catch {
        return null;
      }
    },
  });

  const { data: supportConfig, refetch: refetchSupport } = useQuery({
    queryKey: ["admin-support-config"],
    queryFn: () => fetchSupport(),
  });

  const [waNumber, setWaNumber] = useState("");
  const [csName, setCsName] = useState("");
  const [csHours, setCsHours] = useState("");
  const [csActive, setCsActive] = useState(true);
  const [savingSupport, setSavingSupport] = useState(false);

  useEffect(() => {
    if (supportConfig) {
      setWaNumber(supportConfig.whatsapp_number || "");
      setCsName(supportConfig.support_name || "");
      setCsHours(supportConfig.operating_hours || "");
      setCsActive(supportConfig.is_active ?? true);
    }
  }, [supportConfig]);

  async function handleSaveSupport(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSavingSupport(true);
    try {
      await updateSupport({
        data: {
          whatsapp_number: waNumber,
          support_name: csName,
          operating_hours: csHours,
          is_active: csActive,
        },
      });
      toast.success("Pengaturan WhatsApp CS berhasil disimpan!");
      await refetchSupport();
      await qc.invalidateQueries({ queryKey: ["admin-support-config"] });
      await qc.invalidateQueries({ queryKey: ["app-support-config-public"] });
      setOpenSupport(false);
    } catch (err) {
      toast.error((err as Error).message || "Gagal menyimpan pengaturan CS");
    } finally {
      setSavingSupport(false);
    }
  }

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [type, setType] = useState<"info" | "warning" | "important">("info");
  const [busy, setBusy] = useState(false);
  const EMOJI_PRESETS = ["📢", "⚠️", "🚀", "💡", "🔥", "💰", "🎉", "📌", "⚡", "✨"];

  function insertEmoji(emoji: string) {
    setContent((prev) => (prev ? `${prev} ${emoji}` : emoji));
  }

  const owners = (usersData?.owners ?? []) as Profile[];
  const recentRegistered = [...owners]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 6);
  const totalLicensed = owners.filter((u) => u.license_until && new Date(u.license_until) > new Date()).length;

  async function handleSaveAnnouncement(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      toast.error("Judul dan isi info wajib diisi");
      return;
    }
    setBusy(true);
    try {
      await postAnnouncement({ data: { title: title.trim(), content: content.trim(), type, is_active: true } });
      toast.success("Informasi penting berhasil disiarkan ke seluruh Owner!");
      setTitle("");
      setContent("");
      await refetchAnnouncement();
      await qc.invalidateQueries({ queryKey: ["active-announcement"] });
      setOpenAnnouncement(false);
    } catch (err) {
      toast.error((err as Error).message || "Gagal menyimpan pengumuman");
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleStatus(id: string, current: boolean) {
    try {
      await toggleActive({ data: { id, is_active: !current } });
      toast.success(current ? "Informasi dinonaktifkan" : "Informasi diaktifkan kembali");
      await refetchAnnouncement();
      await qc.invalidateQueries({ queryKey: ["active-announcement"] });
    } catch (err) {
      toast.error((err as Error).message || "Gagal mengubah status informasi");
    }
  }

  const fmtDate = (value: string) => new Date(value).toLocaleString("id-ID", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

  return (
    <main
      className={
        embedded
          ? "w-full pb-4"
          : "mx-auto min-h-screen max-w-md px-4 pb-14 pt-4"
      }
    >
      {!embedded && (
        <Header
          title="Super Admin"
          subtitle="Pusat Kontrol & Monitoring Pendaftaran"
        />
      )}

      <section className="mt-3 grid grid-cols-3 divide-x rounded-xl border bg-card/60 p-2 text-center shadow-xs">
        <div><div className="text-[10px] text-muted-foreground">Total Bisnis</div><div className="mt-0.5 text-sm font-bold text-foreground">{loadingUsers ? "…" : owners.length}</div></div>
        <div><div className="text-[10px] text-muted-foreground">Lisensi Aktif</div><div className="mt-0.5 text-sm font-bold text-emerald-600">{loadingUsers ? "…" : totalLicensed}</div></div>
        <div><div className="text-[10px] text-muted-foreground">Freemium</div><div className="mt-0.5 text-sm font-bold text-foreground">{loadingUsers ? "…" : owners.length - totalLicensed}</div></div>
      </section>

      <DatabaseMetricsCard />

      <section className="mt-3 overflow-hidden rounded-xl border bg-card shadow-xs transition-all">
        <button type="button" onClick={() => setOpenAnnouncement((prev) => !prev)} aria-expanded={openAnnouncement} className="flex w-full items-center justify-between p-3.5 text-left transition-colors hover:bg-muted/40">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Megaphone className="h-4 w-4" /></div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5"><h2 className="text-xs font-bold text-foreground">Siaran Info Owner</h2>{activeAnnouncement?.is_active && <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold text-emerald-600">Tayang</span>}</div>
              <p className="truncate text-[10px] text-muted-foreground">{activeAnnouncement?.is_active ? activeAnnouncement.title : "Klik untuk buat pengumuman"}</p>
            </div>
          </div>
          {openAnnouncement ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
        </button>
        {openAnnouncement && <div className="border-t bg-muted/10 p-3.5 pt-3">
          {activeAnnouncement?.is_active && <div className="mb-3 rounded-lg border border-primary/30 bg-primary/5 p-2.5">
            <div className="flex items-start justify-between gap-2"><div className="min-w-0"><span className="rounded bg-primary/20 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase text-primary">Sedang Tayang</span><div className="mt-1 text-xs font-semibold text-foreground">{activeAnnouncement.title}</div><div className="mt-0.5 whitespace-pre-line text-[11px] text-muted-foreground">{activeAnnouncement.content}</div></div>
              <Button type="button" variant="outline" size="sm" onClick={() => handleToggleStatus(activeAnnouncement.id, true)} className="h-6 shrink-0 border-destructive/40 px-2 text-[10px] text-destructive hover:bg-destructive/10">Tarik / Matikan</Button>
            </div>
          </div>}
          <form onSubmit={handleSaveAnnouncement} className="space-y-2.5">
            <div><span className="text-[10px] font-medium text-muted-foreground">Pilih Emotikon Cepat:</span><div className="mt-1 flex flex-wrap gap-1">{EMOJI_PRESETS.map((emoji) => <button key={emoji} type="button" onClick={() => insertEmoji(emoji)} className="flex h-7 w-7 items-center justify-center rounded-md border bg-muted/60 text-sm hover:bg-muted active:scale-95" aria-label={`Sisipkan emoji ${emoji}`}>{emoji}</button>)}</div></div>
            <div><label className="text-[10px] font-medium text-muted-foreground">Judul Pesan</label><Input required maxLength={150} placeholder="Contoh: Update! 🚀" value={title} onChange={(e) => setTitle(e.target.value)} className="mt-0.5 h-8 text-xs" /></div>
            <div><label className="text-[10px] font-medium text-muted-foreground">Isi Pesan / Penjelasan</label><textarea required maxLength={2000} rows={3} placeholder="Tuliskan info penting yang perlu dibaca pemilik usaha… 💰" value={content} onChange={(e) => setContent(e.target.value)} className="mt-0.5 w-full rounded-md border bg-background p-2 text-xs focus:outline-hidden" /></div>
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1"><div className="flex items-center gap-1.5 text-xs">{(["info", "warning", "important"] as const).map((t) => <button key={t} type="button" onClick={() => setType(t)} className={"rounded-md px-2 py-1 text-[10px] font-medium transition-all " + (type === t ? "bg-foreground text-background" : "bg-muted text-muted-foreground")}>{t === "info" ? "Info Biasa" : t === "warning" ? "Peringatan" : "Penting"}</button>)}</div><Button type="submit" size="sm" disabled={busy} className="h-7 text-xs font-semibold">{busy ? "Menyimpan…" : "Tayangkan Info"}</Button></div>
          </form>
        </div>}
      </section>

      {/* PENGATURAN WHATSAPP CS RESMI */}
      <section className="mt-3 overflow-hidden rounded-xl border bg-card shadow-xs transition-all">
        <button type="button" onClick={() => setOpenSupport((prev) => !prev)} aria-expanded={openSupport} className="flex w-full items-center justify-between p-3.5 text-left transition-colors hover:bg-muted/40">
          <div className="flex min-w-0 items-center gap-2.5"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600"><Headphones className="h-4 w-4" /></div><div className="min-w-0"><div className="flex items-center gap-1.5"><h2 className="text-xs font-bold text-foreground">Kontak WhatsApp CS Support</h2><span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ${csActive ? "bg-emerald-500/15 text-emerald-600" : "bg-muted text-muted-foreground"}`}>{csActive ? "Aktif" : "Mati"}</span></div><p className="truncate font-mono text-[10px] text-muted-foreground">{waNumber || "Belum diatur"}</p></div></div>
          {openSupport ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
        </button>
        {openSupport && <div className="border-t bg-muted/10 p-3.5 pt-3"><form onSubmit={handleSaveSupport} className="space-y-2.5">
          <div><label className="text-[10px] font-medium text-muted-foreground">Nomor WhatsApp CS (diawali 62 atau 08)</label><Input required placeholder="Contoh: 081234567890" value={waNumber} onChange={(e) => setWaNumber(e.target.value)} className="mt-0.5 h-8 font-mono text-xs" /></div>
          <div className="grid grid-cols-2 gap-2"><div><label className="text-[10px] font-medium text-muted-foreground">Nama Tim CS</label><Input required maxLength={100} placeholder="CS Sales Pouch Pro" value={csName} onChange={(e) => setCsName(e.target.value)} className="mt-0.5 h-8 text-xs" /></div><div><label className="text-[10px] font-medium text-muted-foreground">Jam Operasional</label><Input required maxLength={100} placeholder="Senin-Sabtu 08-17 WIB" value={csHours} onChange={(e) => setCsHours(e.target.value)} className="mt-0.5 h-8 text-xs" /></div></div>
          <div className="flex items-center justify-between gap-2 pt-1"><label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={csActive} onChange={(e) => setCsActive(e.target.checked)} className="rounded border-slate-300" />Tampilkan Tombol Bantuan ke Owner</label><div className="flex shrink-0 items-center gap-2">{waNumber && <a href={`https://wa.me/${waNumber.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="rounded-lg border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted">Uji Chat</a>}<Button type="submit" size="sm" disabled={savingSupport} className="h-7 text-xs font-semibold">{savingSupport ? "Menyimpan…" : "Simpan Kontak CS"}</Button></div></div>
        </form></div>}
      </section>

      <section className="mt-4">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-muted-foreground" /><h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Log Pendaftaran Terbaru</h2></div>
          <Link to="/admin" search={{ tab: "users" } as any} className="text-[11px] font-medium text-primary hover:underline">Semua Pengguna ({owners.length}) →</Link>
        </div>
        <div className="mt-2 space-y-2">
          {loadingUsers && <div className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">Memeriksa pendaftar baru…</div>}
          {!loadingUsers && recentRegistered.length === 0 && <div className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">Belum ada pendaftaran akun baru.</div>}
          {recentRegistered.map((u) => {
            const hasLicense = !!u.license_until && new Date(u.license_until) > new Date();
            return (
              <div key={u.id} className="flex items-center justify-between gap-2 rounded-xl border bg-card p-2.5 shadow-xs transition-colors hover:bg-muted/40">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5"><span className="truncate text-xs font-semibold text-foreground">{u.user_email || "Tanpa Email"}</span><span className={"shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium " + (hasLicense ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground")}>{hasLicense ? "Premium" : "Freemium"}</span></div>
                  <div className="truncate text-[11px] text-muted-foreground">{u.business_name || "(Belum isi profil)"}{u.business_category ? " · " + u.business_category : ""}</div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground/80">Daftar: <span className="font-medium text-foreground">{fmtDate(u.created_at)}</span></div>
                </div>
                <Link to="/admin" search={{ tab: "users" } as any} className="shrink-0 rounded-lg border bg-background px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-muted">Kelola</Link>
              </div>
            );
          })}
        </div>
      </section>

      <div className="mt-5">
        <Link to="/admin" search={{ tab: "users" } as any} className="flex items-center justify-between rounded-xl border bg-primary/5 p-3 text-primary transition-colors hover:bg-primary/10">
          <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /><span className="text-xs font-bold">Buka Panel Manajemen Lengkap</span></div>
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </main>
  );
}
export function SalesDashboard({
  businessName,
  profile,
  salesUserId,
}: DashboardProps & { salesUserId?: string }) {
  const activeSalesId = salesUserId ?? profile?.id;
  const subtitle = profile?.display_name
    ? `${profile.display_name} • Sales Lapangan`
    : businessName || "Mode Kunjungan Lapangan";

  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-14 pt-4">
      <Header title="Sales Field" subtitle={subtitle} />

      <div className="mt-4">
        <Button
          asChild
          className="h-14 w-full rounded-2xl bg-primary text-base font-bold text-primary-foreground shadow-md transition-transform active:scale-[0.98]"
        >
          <Link to="/visit" search={{ outlet: undefined }}>
            <Play className="mr-2.5 h-6 w-6 fill-current" />
            Mulai Kunjungan Toko
          </Link>
        </Button>
      </div>

      <SalesFinancialSummary salesId={activeSalesId} />
      <SalesStockSummary salesId={activeSalesId} />

      <section className="mt-4 rounded-2xl border-2 border-slate-200/90 bg-card p-3.5 shadow-xs dark:border-slate-800">
        <div className="mb-3 flex items-center justify-between px-1">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
            Menu Operasional
          </div>
          <span className="text-[11px] font-medium text-slate-500">Pintasan Cepat</span>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <Link
            to="/outlets"
            className="flex items-center gap-3 rounded-xl border-2 border-amber-200/90 bg-amber-50/40 p-3 transition-all hover:bg-amber-100/60 active:scale-[0.98] dark:border-amber-900/40 dark:bg-amber-950/20"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-xs">
              <Store className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-slate-900 dark:text-white">Outlet</div>
              <div className="text-xs font-medium text-slate-600 dark:text-slate-300">Data Warung</div>
            </div>
          </Link>

          <Link
            to="/schedule"
            className="flex items-center gap-3 rounded-xl border-2 border-sky-200/90 bg-sky-50/40 p-3 transition-all hover:bg-sky-100/60 active:scale-[0.98] dark:border-sky-900/40 dark:bg-sky-950/20"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-600 text-white shadow-xs">
              <CalendarDays className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-slate-900 dark:text-white">Jadwal Rute</div>
              <div className="text-xs font-medium text-slate-600 dark:text-slate-300">Urutan Toko</div>
            </div>
          </Link>

          <Link
            to="/sales-stock-day"
            className="flex items-center gap-3 rounded-xl border-2 border-blue-200/90 bg-blue-50/40 p-3 transition-all hover:bg-blue-100/60 active:scale-[0.98] dark:border-blue-900/40 dark:bg-blue-950/20"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-xs">
              <Truck className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-slate-900 dark:text-white">Stok Sales</div>
              <div className="text-xs font-medium text-slate-600 dark:text-slate-300">Muat & Sisa</div>
            </div>
          </Link>

          <Link
            to="/transactions"
            className="flex items-center gap-3 rounded-xl border-2 border-purple-200/90 bg-purple-50/40 p-3 transition-all hover:bg-purple-100/60 active:scale-[0.98] dark:border-purple-900/40 dark:bg-purple-950/20"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-purple-600 text-white shadow-xs">
              <History className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-slate-900 dark:text-white">Riwayat Nota</div>
              <div className="text-xs font-medium text-slate-600 dark:text-slate-300">Penjualan</div>
            </div>
          </Link>

          <Link
            to="/expenses"
            className="flex items-center gap-3 rounded-xl border-2 border-rose-200/90 bg-rose-50/40 p-3 transition-all hover:bg-rose-100/60 active:scale-[0.98] dark:border-rose-900/40 dark:bg-rose-950/20"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-600 text-white shadow-xs">
              <Wallet className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-slate-900 dark:text-white">Pengeluaran</div>
              <div className="text-xs font-medium text-slate-600 dark:text-slate-300">Bensin & Makan</div>
            </div>
          </Link>

          <Link
            to="/notes"
            className="flex items-center gap-3 rounded-xl border-2 border-orange-200/90 bg-orange-50/40 p-3 transition-all hover:bg-orange-100/60 active:scale-[0.98] dark:border-orange-900/40 dark:bg-orange-950/20"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-600 text-white shadow-xs">
              <FileText className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-slate-900 dark:text-white">Catatan</div>
              <div className="text-xs font-medium text-slate-600 dark:text-slate-300">Pengingat Toko</div>
            </div>
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


// Kartu stok Sales dengan kontras tinggi untuk penggunaan outdoor.
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
    staleTime: 30_000,
  });

  const total = (data ?? []).reduce((sum, row) => sum + (Number(row.quantity) || 0), 0);

  return (
    <section className="mt-3.5 rounded-2xl border-2 border-blue-300 bg-blue-50/80 p-3.5 shadow-sm dark:border-blue-800 dark:bg-blue-950/30">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-extrabold uppercase tracking-wider text-blue-900 dark:text-blue-300">
            Stok Dibawa Saat Ini
          </div>
          <div className="mt-0.5 text-xs font-medium text-blue-800/90 dark:text-blue-200/80">
            Total barang fisik di bagasi / kendaraan
          </div>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-xs">
          <Truck className="h-5 w-5" />
        </div>
      </div>
      <div className="mt-2.5 text-2xl font-black text-slate-900 dark:text-white">
        {isLoading ? "…" : isError ? "—" : `${total.toLocaleString("id-ID")} pcs`}
      </div>
      {!isLoading && !isError && total === 0 && (
        <div className="mt-1 text-xs font-semibold text-blue-700 dark:text-blue-300">
          ⚠️ Belum ada muat stok hari ini.
        </div>
      )}
    </section>
  );
}

// Ringkasan finansial dan rute hari ini dengan kontras tinggi.
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
    <section className="mt-3.5 rounded-2xl border-2 border-slate-200/90 bg-card p-3.5 shadow-xs dark:border-slate-800">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-xs font-extrabold uppercase tracking-wider text-slate-900 dark:text-slate-100">
            Ringkasan Hari Ini
          </div>
          <div className="text-xs font-medium text-slate-600 dark:text-slate-400">
            Target rute & tagihan berjalan
          </div>
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <CalendarDays className="h-4 w-4" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-xl border border-emerald-300 bg-emerald-50/70 p-3 dark:border-emerald-800/60 dark:bg-emerald-950/20">
          <div className="text-xs font-bold text-emerald-900 dark:text-emerald-300">Sisa Uang Jalan</div>
          <div className="mt-1 truncate text-base font-extrabold text-slate-900 dark:text-white">
            {value(data?.travel_balance, true)}
          </div>
        </div>

        <div className="rounded-xl border border-sky-300 bg-sky-50/70 p-3 dark:border-sky-800/60 dark:bg-sky-950/20">
          <div className="text-xs font-bold text-sky-900 dark:text-sky-300">Jumlah Outlet</div>
          <div className="mt-1 text-base font-extrabold text-slate-900 dark:text-white">
            {value(data?.scheduled_outlets_today)} toko
          </div>
        </div>

        <div className="rounded-xl border border-purple-300 bg-purple-50/70 p-3 dark:border-purple-800/60 dark:bg-purple-950/20">
          <div className="text-xs font-bold text-purple-900 dark:text-purple-300">Target Tagihan</div>
          <div className="mt-1 truncate text-base font-extrabold text-slate-900 dark:text-white">
            {value(data?.scheduled_bill_target, true)}
          </div>
        </div>

        <div className="rounded-xl border border-amber-300 bg-amber-50/70 p-3 dark:border-amber-800/60 dark:bg-amber-950/20">
          <div className="text-xs font-bold text-amber-900 dark:text-amber-300">Uang Tertagih</div>
          <div className="mt-1 truncate text-base font-extrabold text-slate-900 dark:text-white">
            {value(data?.collected_today, true)}
          </div>
          <div className="mt-0.5 text-[11px] font-semibold text-amber-800 dark:text-amber-400">
            sudah disetor/masuk
          </div>
        </div>
      </div>
    </section>
  );
}

// Sales mode access: outlet, stock, history, schedule, travel funds, and notes.
