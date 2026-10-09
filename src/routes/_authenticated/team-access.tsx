import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Check, ChevronDown, RotateCcw, ShieldCheck, UserCog } from "lucide-react";
import { toast } from "sonner";
import { useProfile } from "@/hooks/use-profile";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { listTeam, replaceTeamPermissions, setTeamMemberRole } from "@/lib/team.functions";
import { Button } from "@/components/ui/button";
import { ACCESS_GROUPS, ADMIN_DEFAULTS, MANAGER_DEFAULTS, SALES_DEFAULTS, type AccessGroup } from "@/lib/team-access";

export const Route = createFileRoute("/_authenticated/team-access")({
  head: () => ({ meta: [{ title: "Jabatan & Akses — Sales Pouch" }, { name: "description", content: "Owner menentukan jabatan dan hak akses setiap anggota tim." }] }),
  component: TeamAccessPage,
});

type JobLevel = "admin" | "manager" | "sales";
type PermissionGroup = AccessGroup;

type TeamMember = {
  user_id: string;
  position: JobLevel;
  permissions?: string[];
  hasCustomPermissions?: boolean;
  profiles: { display_name?: string; username?: string } | null;
};

const managerAdminGroups: PermissionGroup[] = ACCESS_GROUPS;

const salesGroups: PermissionGroup[] = [
  { title: "Operasional", items: [
    { key: "outlets", label: "Outlet", description: "Melihat dan mengelola data outlet." },
    { key: "sales_stock", label: "Stok Sales", description: "Melihat dan mengelola stok Sales." },
    { key: "transactions", label: "Transaksi", description: "Melihat transaksi Sales." },
    { key: "travel_funds", label: "Uang Jalan", description: "Melihat uang jalan Sales." },
    { key: "notes", label: "Catatan", description: "Melihat dan mengelola catatan operasional." },
    { key: "expenses", label: "Pengeluaran", description: "Mencatat pengeluaran Sales." },
  ] },
];

const levelDefaults: Record<JobLevel, string[]> = {
  admin: [...ADMIN_DEFAULTS],
  manager: [...MANAGER_DEFAULTS],
  sales: [...SALES_DEFAULTS],
};

function TeamAccessPage() {
  const { data: profile, isLoading: profileLoading } = useProfile();
  const { data: isAdmin, isLoading: adminLoading } = useIsAdmin();
  const fetchTeam = useServerFn(listTeam);
  const saveRole = useServerFn(setTeamMemberRole);
  const savePermissions = useServerFn(replaceTeamPermissions);
  const qc = useQueryClient();
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

  const selectedMember = useMemo(
    () => (members as TeamMember[]).find((member) => member.user_id === selectedId) ?? null,
    [members, selectedId],
  );

  function expandLegacyPermissions(saved: string[], groups: PermissionGroup[]) {
    const result = new Set(saved);
    for (const group of groups) for (const item of group.items) {
      if (!item.children?.length) continue;
      const hasChild = item.children.some((child) => result.has(child.key));
      if (result.has(item.key) && !hasChild) item.children.forEach((child) => result.add(child.key));
      if (hasChild) result.add(item.key);
    }
    return [...result];
  }

  function selectMember(userId: string) {
    const member = (members as TeamMember[]).find((item) => item.user_id === userId);
    setSelectedId(userId);
    if (!member) return;
    setLevel(member.position);
    const groups = member.position === "sales" ? salesGroups : managerAdminGroups;
    setPermissions(member.hasCustomPermissions ? expandLegacyPermissions(member.permissions ?? [], groups) : levelDefaults[member.position]);
  }

  function changeLevel(next: JobLevel) {
    setLevel(next);
    // A role change starts from that role's recommended baseline, then the
    // Owner can customize individual menus before saving.
    setPermissions(levelDefaults[next]);
  }

  function toggleChild(childKey: string, parentKey: string) {
    setPermissions((current) => {
      const exists = current.includes(childKey);
      const next = exists ? current.filter((key) => key !== childKey) : [...current, childKey];
      if (!exists && !next.includes(parentKey)) next.push(parentKey);
      return next;
    });
  }

  function toggleParent(item: PermissionGroup["items"][number]) {
    const childKeys = item.children?.map((child) => child.key) ?? [];
    setPermissions((current) => {
      if (current.includes(item.key)) {
        return current.filter((key) => key !== item.key && !childKeys.includes(key));
      }
      return [...current, item.key];
    });
  }

  function applyRoleDefaults() {
    setPermissions(levelDefaults[level]);
    const label = level === "manager" ? "Manajer" : level === "admin" ? "Admin" : "Sales";
    toast.info(`Default hak akses ${label} diterapkan.`);
  }

  function permissionsForSave() {
    const groups = level === "sales" ? salesGroups : managerAdminGroups;
    const result = new Set<string>();
    for (const group of groups) {
      for (const item of group.items) {
        if (!permissions.includes(item.key)) continue;
        result.add(item.key);
        if (item.children?.length) {
          item.children.map((child) => child.key)
            .filter((key) => permissions.includes(key))
            .forEach((key) => result.add(key));
        }
      }
    }
    return [...result];
  }

  async function save() {
    if (!selectedId) {
      toast.error("Pilih anggota tim terlebih dahulu.");
      return;
    }

    setSaving(true);
    try {
      await saveRole({ data: { userId: selectedId, position: level } });
      await savePermissions({ data: { userId: selectedId, permissionKeys: permissionsForSave() } });
      await qc.invalidateQueries({ queryKey: ["team-access", profile?.ownerId] });
      await qc.invalidateQueries({ queryKey: ["team", profile?.ownerId] });
      toast.success("Jabatan dan akses berhasil disimpan.");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
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
          {(members as TeamMember[]).map((member) => {
            const p = member.profiles;
            const label = member.position === "manager" ? "Manajer" : member.position === "admin" ? "Admin" : "Sales";
            return <option key={member.user_id} value={member.user_id}>{p?.display_name ?? p?.username ?? "Karyawan"} — {label}</option>;
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
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">Izin Menu: <strong className="text-foreground">{level === "manager" ? "Manajer" : level === "admin" ? "Admin" : "Sales"}</strong></div>
          <Button type="button" variant="outline" size="sm" onClick={applyRoleDefaults} className="h-8 gap-1 text-xs">
            <RotateCcw className="h-3 w-3" /> Terapkan Default Jabatan
          </Button>
        </div>
        {(level === "sales" ? salesGroups : managerAdminGroups).map((group) => (
          <div key={group.title}>
            <h2 className="mb-2 px-1 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">{group.title}</h2>
            <div className="overflow-hidden rounded-2xl border bg-card">
              {group.items.map((item, index) => {
                const isSales = level === "sales";
                const childKeys = item.children?.map((child) => child.key) ?? [];
                const hasChildren = childKeys.length > 0;
                const checked = permissions.includes(item.key);
                const allChildren = hasChildren && childKeys.every((key) => permissions.includes(key));

                return (
                  <div key={item.key} className={index ? "border-t" : ""}>
                    <button type="button" onClick={() => toggleParent(item)} className="flex w-full items-center gap-3 p-3 text-left transition hover:bg-muted/40">
                      <span className={checked ? "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-primary bg-primary text-primary-foreground" : "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border bg-background"}>
                        {checked && <Check className="h-4 w-4" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">{item.label}</span>
                        <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">{item.description}</span>
                      </span>
                      {hasChildren ? (
                        <span className="text-[10px] text-muted-foreground">
                          {checked ? (allChildren ? "Semua Aktif" : `${childKeys.filter((key) => permissions.includes(key)).length}/${childKeys.length} Fitur`) : "Terkunci"}
                        </span>
                      ) : null}
                    </button>

                    {hasChildren && checked ? (
                      <div className="border-t bg-muted/20 px-3 pb-2">
                        {item.children!.map((child) => {
                          const childChecked = permissions.includes(child.key);
                          return (
                            <button type="button" key={child.key} onClick={() => toggleChild(child.key, item.key)} className="flex w-full items-center gap-3 py-2.5 pl-9 text-left">
                              <span className={childChecked ? "flex h-5 w-5 shrink-0 items-center justify-center rounded border border-primary bg-primary text-primary-foreground" : "flex h-5 w-5 shrink-0 items-center justify-center rounded border bg-background"}>
                                {childChecked && <Check className="h-3.5 w-3.5" />}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block text-xs font-semibold">{child.label}</span>
                                <span className="block text-[10px] leading-4 text-muted-foreground">{child.description}</span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ))}</section>

      <Button disabled={saving} onClick={save} className="mt-6 h-12 w-full rounded-xl">{saving ? "Menyimpan…" : "Simpan Jabatan & Akses"}</Button>
      <p className="mt-3 text-center text-[11px] leading-4 text-muted-foreground">Perubahan disimpan ke database dan berlaku pada akses tim setelah login/refresh berikutnya.</p>
    </>}
  </main>;
}
