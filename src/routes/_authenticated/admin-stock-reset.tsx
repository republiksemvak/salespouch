import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, RotateCcw, Search, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { useIsAdmin } from "@/hooks/use-is-admin";
import { getAdminUsers, resetStockOpening } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/admin-stock-reset")({
  head: () => ({ meta: [{ title: "Reset Stok Pembukaan — Super Admin" }] }),
  component: AdminStockResetPage,
});

function AdminStockResetPage() {
  const { data: isAdmin, isLoading } = useIsAdmin();
  if (isLoading) return <div className="p-10 text-center text-muted-foreground">Memuat…</div>;
  if (!isAdmin) return <div className="p-10 text-center text-destructive">Halaman ini khusus super admin.</div>;
  return <ResetPanel />;
}

function ResetPanel() {
  const qc = useQueryClient();
  const getUsers = useServerFn(getAdminUsers);
  const reset = useServerFn(resetStockOpening);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ["admin-users-stock-reset"], queryFn: () => getUsers({}) });
  const owners = (data?.owners ?? []) as Array<{ id: string; user_email?: string | null; business_name?: string | null; business_category?: string | null }>;
  const needle = q.trim().toLowerCase();
  const rows = owners.filter((u) => `${u.user_email ?? ""} ${u.business_name ?? ""} ${u.business_category ?? ""}`.toLowerCase().includes(needle));

  async function doReset(ownerId: string, label: string) {
    const ok = confirm(`Reset total Stok Pembukaan untuk ${label}?\n\nMode pilihan dan seluruh isi Stok Pembukaan akan dihapus. Master Produk, Toko/Outlet, Sales, dan data usaha lainnya tidak dihapus.`);
    if (!ok) return;
    setBusy(ownerId);
    try {
      const result = await reset({ data: { ownerId } });
      toast.success(result.reset ? "Stok Pembukaan berhasil direset. User dapat memilih mode kembali." : "Belum ada proses Stok Pembukaan untuk user ini.");
      qc.invalidateQueries({ queryKey: ["admin-users-stock-reset"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return <main className="mx-auto min-h-screen max-w-3xl px-5 pb-16 pt-6">
    <Link to="/admin" className="flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" /> Kembali ke Super Admin</Link>
    <header className="mt-5 flex items-start gap-3">
      <div className="rounded-2xl bg-orange-100 p-3 text-orange-700"><RotateCcw className="h-6 w-6" /></div>
      <div><h1 className="text-2xl font-bold">Reset Stok Pembukaan</h1><p className="mt-1 text-sm text-muted-foreground">Bantuan Super Admin untuk user yang salah memilih mode atau salah mengisi stok awal.</p></div>
    </header>
    <div className="mt-5 rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-950">
      <div className="flex gap-2 font-semibold"><ShieldAlert className="h-5 w-5 shrink-0" /> Reset hanya untuk proses Stok Pembukaan</div>
      <p className="mt-1 leading-5">Reset menghapus pilihan mode dan seluruh data stok pembukaan user tersebut, lalu mengembalikan user ke pilihan awal. Master Produk, Toko/Outlet, Sales, dan data usaha lain tetap aman.</p>
    </div>
    <div className="relative mt-5"><Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari bisnis atau email…" className="h-11 pl-9" /></div>
    <section className="mt-4 space-y-3">
      {isLoading && <div className="rounded-xl border p-5 text-center text-sm text-muted-foreground">Memuat user…</div>}
      {!isLoading && rows.map((u) => {
        const label = u.business_name || u.user_email || u.id;
        return <div key={u.id} className="rounded-2xl border bg-card p-4"><div className="min-w-0"><div className="font-semibold">{label}</div><div className="truncate text-xs text-muted-foreground">{u.user_email}</div><div className="mt-1 text-xs text-muted-foreground">{u.business_category || "Jenis usaha belum diisi"}</div></div><Button className="mt-3 w-full rounded-xl" variant="outline" disabled={busy === u.id} onClick={() => doReset(u.id, label)}><RotateCcw className="mr-2 h-4 w-4" />{busy === u.id ? "Mereset…" : "Reset Stok Pembukaan"}</Button></div>;
      })}
      {!isLoading && !rows.length && <div className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">User tidak ditemukan.</div>}
    </section>
  </main>;
}
