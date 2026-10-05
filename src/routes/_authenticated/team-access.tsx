import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useServerFn } from "@tanstack/react-query";
import { ArrowLeft, Check, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useProfile } from "@/hooks/use-profile";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { listTeam } from "@/lib/team.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/team-access")({
  head: () => ({ meta: [{ title: "Akses Manager — Sales Pouch" }, { name: "description", content: "Atur menu yang boleh diakses setiap Manager." }] }),
  component: TeamAccessPage,
});

type PermissionGroup = { title: string; items: { key: string; label: string; description: string }[] };

const groups: PermissionGroup[] = [
  { title: "Operasional", items: [
    { key: "team", label: "Tim", description: "Melihat dan mengelola tim sesuai kewenangan." },
    { key: "outlets", label: "Outlet", description: "Melihat dan mengelola data outlet." },
    { key: "schedule", label: "Jadwal Toko", description: "Mengatur jadwal kunjungan outlet." },
    { key: "sales_stock", label: "Stok Sales", description: "Melihat dan mengelola stok Sales." },
    { key: "transactions", label: "Transaksi", description: "Melihat riwayat dan transaksi Sales." },
    { key: "operations", label: "Operasional", description: "Melihat uang jalan, pengeluaran, saldo, dan rekap operasional." },
    { key: "direct_selling", label: "Direct Selling", description: "Mengelola penjualan langsung dari gudang." },
  ] },
  { title: "Analitik", items: [
    { key: "reports", label: "Laporan", description: "Melihat laporan bisnis dan penjualan." },
    { key: "kpi", label: "KPI", description: "Akses KPI dan penilaian kinerja." },
  ] },
  { title: "Keuangan & SDM", items: [
    { key: "travel_funds", label: "Uang Jalan", description: "Melihat dan mengelola uang jalan Sales." },
    { key: "notes", label: "Catatan", description: "Melihat dan mengelola catatan operasional." },
    { key: "payroll", label: "Payroll", description: "Akses penggajian dan data payroll." },
  ] },
  { title: "Master", items: [
    { key: "products", label: "Master Produk", description: "Mengelola produk bisnis." },
    { key: "master_stock", label: "Master Stok", description: "Mengelola stok gudang." },
    { key: "profile", label: "Profil Usaha", description: "Mengelola profil dan pengaturan usaha." },
  ] },
];

const defaultPermissions = ["team", "outlets", "schedule", "sales_stock", "transactions", "reports", "travel_funds", "notes"];

function TeamAccessPage() {
  const { data: profile, isLoading: profileLoading } = useProfile();
  const { data: isAdmin, isLoading: adminLoading } = useIsAdmin();
  const fetchTeam = useServerFn(listTeam);
  const [managerId, setManagerId] = useState("");
  const [permissions, setPermissions] = useState<string[]>(defaultPermissions);
  const [saving, setSaving] = useState(false);
  const canManage = !!isAdmin || profile?.role === "owner";

  const { data: members = [], isLoading: teamLoading } = useQuery({
    queryKey: ["team-access", profile?.ownerId],
    enabled: canManage,
    queryFn: () => fetchTeam({ data: {} }),
  });

  const managers = useMemo(() => members.filter((member) => member.position === "manager"), [members]);

  function toggle(key: string) {
    setPermissions((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  }

  async function save() {
    if (!managerId) {
      toast.error("Pilih Manager terlebih dahulu.");
      return;
    }
    setSaving(true);
    // UI is ready; persistence is intentionally blocked until the permission tables/RLS are installed.
    await new Promise((resolve) => setTimeout(resolve, 250));
    setSaving(false);
    toast.info("Tampilan akses sudah disiapkan. Penyimpanan permanen menunggu integrasi database.");
  }

  if (profileLoading || adminLoading || teamLoading) return <main className="p-10 text-center">Memuat…</main>;
  if (!canManage) return <main className="mx-auto max-w-md px-5 py-10 text-sm text-destructive">Hanya Owner yang dapat mengatur akses Manager.</main>;

  return <main className="mx-auto min-h-screen max-w-md px-5 pb-10 pt-6">
    <Link to="/team" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" />Kembali ke Tim</Link>
    <header className="mt-4 rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-100 text-blue-700"><ShieldCheck className="h-6 w-6" /></div><div><h1 className="text-xl font-bold">Akses Manager</h1><p className="mt-1 text-xs leading-5 text-muted-foreground">Owner menentukan menu yang boleh dibuka oleh setiap Manager. KPI dan Payroll sudah disiapkan untuk tahap berikutnya.</p></div></div>
    </header>

    <section className="mt-5">
      <label className="text-sm font-semibold">Pilih Manager</label>
      <select value={managerId} onChange={(e) => setManagerId(e.target.value)} className="mt-2 h-12 w-full rounded-xl border bg-background px-3 text-sm">
        <option value="">Pilih Manager...</option>
        {managers.map((member) => { const p = member.profiles as { display_name?: string; username?: string } | null; return <option key={member.user_id} value={member.user_id}>{p?.display_name ?? p?.username ?? "Manager"}</option>; })}
      </select>
    </section>

    <section className="mt-5 space-y-5">
      {groups.map((group) => <div key={group.title}><h2 className="mb-2 px-1 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">{group.title}</h2><div className="overflow-hidden rounded-2xl border bg-card">{group.items.map((item, index) => { const checked = permissions.includes(item.key); return <button type="button" key={item.key} onClick={() => toggle(item.key)} className={`flex w-full items-center gap-3 p-3 text-left ${index ? "border-t" : ""}`}><span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${checked ? "border-primary bg-primary text-primary-foreground" : "bg-background"}`}>{checked && <Check className="h-4 w-4" />}</span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{item.label}</span><span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">{item.description}</span></span></button>; })}</div></div>)}
    </section>

    <Button disabled={saving || !managerId} onClick={save} className="mt-6 h-12 w-full rounded-xl">{saving ? "Menyimpan…" : "Simpan Akses Manager"}</Button>
    <p className="mt-3 text-center text-[11px] leading-4 text-muted-foreground">Pengaturan di layar ini belum mengubah akses database. Integrasi permanen akan memakai permission khusus per Manager agar URL/API juga terlindungi.</p>
  </main>;
}
