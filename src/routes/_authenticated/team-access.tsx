import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Check, ChevronDown, ShieldCheck, UserCog } from "lucide-react";
import { toast } from "sonner";
import { useProfile } from "@/hooks/use-profile";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { listTeam } from "@/lib/team.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/team-access")({
  head: () => ({ meta: [{ title: "Jabatan & Akses — Sales Pouch" }, { name: "description", content: "Owner menentukan jabatan dan hak akses setiap anggota tim." }] }),
  component: TeamAccessPage,
});

type JobLevel = "admin" | "manager" | "sales";
type PermissionGroup = { title: string; items: { key: string; label: string; description: string }[] };

const groups: PermissionGroup[] = [
  { title: "Operasional", items: [
    { key: "team", label: "Tim", description: "Melihat dan mengelola tim sesuai kewenangan." },
    { key: "outlets", label: "Outlet", description: "Melihat dan mengelola data outlet." },
    { key: "schedule", label: "Jadwal Toko", description: "Mengatur jadwal kunjungan outlet." },
    { key: "sales_stock", label: "Stok Sales", description: "Melihat dan mengelola stok Sales." },
    { key: "transactions", label: "Transaksi", description: "Melihat transaksi Sales." },
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

const allPermissions = groups.flatMap((group) => group.items.map((item) => item.key));
const levelDefaults: Record<JobLevel, string[]> = {
  admin: ["team", "outlets", "schedule", "sales_stock", "transactions", "reports", "travel_funds", "notes"],
  manager: ["team", "outlets", "schedule", "sales_stock", "transactions", "reports", "travel_funds", "notes"],
  sales: ["outlets", "sales_stock", "transactions", "travel_funds", "notes"],
};

function TeamAccessPage() {
  const { data: profile, isLoading: profileLoading } = useProfile();
  const { data: isAdmin, isLoading: adminLoading } = useIsAdmin();
  const fetchTeam = useServerFn(listTeam);
  const [selectedId, setSelectedId] = useState("");
  const [level, setLevel] = useState<JobLevel>("sales");
  const [permissions, setPermissions] = useState<string[]>(levelDefaults.sales);
  const [saving, setSaving] = useState(false);
  const canManage = !!isAdmin || profile?.role === "owner";

  const { data: members = [], isLoading: teamLoading } = useQuery({
    queryKey: ["team-access", profile?.ownerId],
    enabled: canManage,
    queryFn: () => fetchTeam({ data: {} }),
  });

  const selectedMember = useMemo(() => members.find((member) => member.user_id === selectedId) ?? null, [members, selectedId]);

  function selectMember(userId: string) {
    const member = members.find((item) => item.user_id === userId);
    setSelectedId(userId);
    const memberLevel = member?.position === "manager" ? "manager" : "sales";
    setLevel(memberLevel);
    setPermissions(levelDefaults[memberLevel]);
  }

  function changeLevel(next: JobLevel) {
    setLevel(next);
    setPermissions(levelDefaults[next]);
  }

  function toggle(key: string) {
    setPermissions((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  }

  async function save() {
    if (!selectedId) { toast.error("Pilih anggota tim terlebih dahulu."); return; }
    setSaving(true);
    await new Promise((resolve) => setTimeout(resolve, 250));
    setSaving(false);
    toast.info("UI jabatan & akses sudah siap. Penyimpanan permanen akan dihubungkan ke database pada tahap berikutnya.");
  }

  if (profileLoading || adminLoading || teamLoading) return <main className="p-10 text-center">Memuat…</main>;
  if (!canManage) return <main className="mx-auto max-w-md px-5 py-10 text-sm text-destructive">Hanya Owner yang dapat mengatur jabatan dan akses tim.</main>;

  return <main className="mx-auto min-h-screen max-w-md px-5 pb-10 pt-6">
    <Link to="/team" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" />Kembali ke Tim</Link>

    <header className="mt-4 rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-100 text-blue-700"><ShieldCheck className="h-6 w-6" /></div>
        <div><h1 className="text-xl font-bold">Jabatan & Akses</h1><p className="mt-1 text-xs leading-5 text-muted-foreground">Owner menentukan level jabatan dan menu yang boleh diakses setiap anggota.</p></div>
      </div>
    </header>

    <section className="mt-5 rounded-2xl border bg-card p-4">
      <div className="flex items-center gap-2"><UserCog className="h-4 w-4 text-muted-foreground" /><h2 className="text-sm font-semibold">Anggota Tim</h2></div>
      <label className="mt-3 block text-xs font-medium text-muted-foreground">Pilih orang</label>
      <div className="relative mt-2">
        <select value={selectedId} onChange={(e) => selectMember(e.target.value)} className="h-12 w-full appearance-none rounded-xl border bg-background px-3 pr-10 text-sm">
          <option value="">Pilih anggota tim...</option>
          {members.map((member) => {
            const p = member.profiles as { display_name?: string; username?: string } | null;
            return <option key={member.user_id} value={member.user_id}>{p?.display_name ?? p?.username ?? "Karyawan"} — {member.position === "manager" ? "Manajer" : "Sales"}</option>;
          })}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-3.5 h-5 w-5 text-muted-foreground" />
      </div>
    </section>

    {selectedMember && <>
      <section className="mt-4 rounded-2xl border bg-card p-4">
        <h2 className="text-sm font-semibold">Level Jabatan</h2>
        <p className="mt-1 text-xs text-muted-foreground">Bisa dinaikkan atau diturunkan kapan saja oleh Owner tanpa membuat akun baru.</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {(["sales", "manager", "admin"] as JobLevel[]).map((item) => <button key={item} type="button" onClick={() => changeLevel(item)} className={`rounded-xl border px-2 py-3 text-sm font-semibold transition ${level === item ? "border-primary bg-primary text-primary-foreground" : "bg-background"}`}><span className="block">{item === "sales" ? "Sales" : item === "manager" ? "Manajer" : "Admin"}</span><span className={`mt-1 block text-[10px] font-normal ${level === item ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{item === "sales" ? "Lapangan" : item === "manager" ? "Pimpin tim" : "Administrasi"}</span></button>)}
        </div>
      </section>

      <section className="mt-5 space-y-5">
        <div className="rounded-xl border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">Level <strong className="text-foreground">{level === "manager" ? "Manajer" : level === "admin" ? "Admin" : "Sales"}</strong> hanya menjadi jabatan. Owner tetap menentukan hak akses menu di bawah.</div>
        {groups.map((group) => <div key={group.title}><h2 className="mb-2 px-1 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">{group.title}</h2><div className="overflow-hidden rounded-2xl border bg-card">{group.items.map((item, index) => { const checked = permissions.includes(item.key); return <button type="button" key={item.key} onClick={() => toggle(item.key)} className={`flex w-full items-center gap-3 p-3 text-left ${index ? "border-t" : ""}`}><span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${checked ? "border-primary bg-primary text-primary-foreground" : "bg-background"}`}>{checked && <Check className="h-4 w-4" />}</span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{item.label}</span><span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">{item.description}</span></span></button>; })}</div></div>)}
      </section>

      <Button disabled={saving} onClick={save} className="mt-6 h-12 w-full rounded-xl">{saving ? "Menyimpan…" : "Simpan Jabatan & Akses"}</Button>
      <p className="mt-3 text-center text-[11px] leading-4 text-muted-foreground">UI sudah disiapkan untuk promosi Sales → Manajer → Admin. Integrasi database/RLS dilakukan setelah UI diverifikasi.</p>
    </>}
  </main>;
}
