import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Phone, Plus, Store, LogOut, Package, Search, UserCog, ShieldCheck, Users, History, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { accessStatus } from "@/lib/access";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Outlet Saya — Sales Pouch" }, { name: "description", content: "Daftar outlet Anda." }, { property: "og:title", content: "Outlet Saya — Sales Pouch" }, { property: "og:description", content: "Daftar outlet Anda." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { data: p } = useProfile();
  const { data: isAdmin } = useIsAdmin();
  const [q, setQ] = useState("");
  const search = q.trim();
  const status = p?.profile ? accessStatus(p.profile, p.email) : null;

  const { data: outletResult, isLoading } = useQuery({
    queryKey: ["outlets", search],
    queryFn: async () => {
      // Dashboard hanya mengambil kolom yang benar-benar ditampilkan.
      // Foto toko tetap tidak dimuat di daftar agar halaman ringan.
      let query = supabase
        .from("outlets")
        .select("id,name,owner_phone,map_location,created_at", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(0, 49);

      if (search) {
        const safeSearch = search.replace(/[%_]/g, (char) => `\\${char}`);
        query = query.ilike("name", `%${safeSearch}%`);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return { data: data ?? [], count: count ?? 0 };
    },
    staleTime: 30_000,
  });

  const outlets = outletResult?.data ?? [];
  const outletCount = outletResult?.count ?? 0;

  return (
    <main className="mx-auto min-h-screen max-w-md px-5 pb-28 pt-6">
      <header className="flex items-start justify-between">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Sales Pouch</div>
          <h1 className="mt-1 text-2xl font-bold">{p?.profile?.business_name}</h1>
        </div>
        <Button variant="ghost" size="icon" onClick={() => supabase.auth.signOut()} aria-label="Keluar"><LogOut className="h-5 w-5" /></Button>
      </header>

      {status?.reason === "trial" && status.trialEndsAt && (
        <div className="mt-4 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm">
          Trial aktif sampai <b>{status.trialEndsAt.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}</b>
        </div>
      )}

      {p?.role === "owner" && <div className="mt-4 grid grid-cols-2 gap-2">
        <Button asChild variant="outline" className="h-11"><Link to="/products"><Package className="mr-1 h-4 w-4" />Master Produk</Link></Button>
        <Button asChild variant="outline" className="h-11"><Link to="/profile"><UserCog className="mr-1 h-4 w-4" />Profil Usaha</Link></Button>
        <Button asChild variant="outline" className="col-span-2 h-11"><Link to="/reports"><Package className="mr-1 h-4 w-4" />Laporan Keuangan</Link></Button>
        <Button asChild variant="outline" className="col-span-2 h-11"><Link to="/team"><Users className="mr-1 h-4 w-4" />Manajemen Tim</Link></Button>
        {isAdmin && <Button asChild className="col-span-2 h-11"><Link to="/admin"><ShieldCheck className="mr-1 h-4 w-4" />Dashboard Super Admin</Link></Button>}
      </div>}
      <Button asChild variant="outline" className="mt-2 h-11 w-full"><Link to="/transactions"><History className="mr-1 h-4 w-4" />Riwayat Transaksi</Link></Button>

      <div className="mt-8 flex items-center justify-between gap-3">
        <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Outlet ({outletCount})
        </h2>
        {outletCount > 50 && <span className="text-[11px] text-muted-foreground">50 terbaru</span>}
      </div>

      <div className="relative mt-3">
        <Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Cari toko…" value={q} onChange={(e) => setQ(e.target.value)} className="h-11 pl-9" />
      </div>

      <div className="mt-3 space-y-3">
        {isLoading && <p className="text-sm text-muted-foreground">Memuat…</p>}
        {!isLoading && outlets.length === 0 && (
          <div className="rounded-2xl border border-dashed p-8 text-center">
            <Store className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">{search ? "Outlet tidak ditemukan." : "Belum ada outlet. Tambahkan outlet pertama Anda."}</p>
          </div>
        )}
        {outlets.map((o) => (
          <div key={o.id} className="flex gap-3 rounded-2xl border bg-card p-3">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-muted">
              <Store className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{o.name}</div>
              {o.owner_phone && <a href={`tel:${o.owner_phone}`} className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Phone className="h-3 w-3" />{o.owner_phone}</a>}
              {o.map_location && (
                <a href={o.map_location.startsWith("http") ? o.map_location : `https://maps.google.com/?q=${encodeURIComponent(o.map_location)}`}
                  target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-1 text-xs text-accent underline">
                  <MapPin className="h-3 w-3" />Buka peta
                </a>
              )}
            </div>
            <div className="flex shrink-0 flex-col gap-1 self-center">
              <Button asChild size="sm"><Link to="/visit" search={{ outlet: o.id }}>Kunjungi</Link></Button>
              {p?.role === "owner" && <Button asChild size="icon" variant="ghost" className="self-end" aria-label={`Edit ${o.name}`}><Link to="/outlets/$id/edit" params={{ id: o.id }}><Pencil className="h-4 w-4" /></Link></Button>}
            </div>
          </div>
        ))}
      </div>

      <div className="fixed inset-x-0 bottom-0 mx-auto max-w-md bg-gradient-to-t from-background via-background to-transparent px-5 pb-5 pt-8">
        <Button asChild size="lg" variant="outline" className="mb-2 h-12 w-full"><Link to="/visit" search={{ outlet: undefined }}>Mulai Kunjungan</Link></Button>
        <Button asChild size="lg" className="h-14 w-full text-base"><Link to="/outlets/new"><Plus className="mr-1 h-5 w-5" />Tambah Outlet</Link></Button>
      </div>
    </main>
  );
}
