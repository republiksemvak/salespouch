import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, MapPin, Pencil, Phone, Search, Store, LockKeyhole } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/outlets")({
  head: () => ({
    meta: [{ title: "Semua Outlet — Sales Pouch" }, { name: "description", content: "Daftar seluruh outlet terdaftar." }],
  }),
  component: AllOutlets,
});

type RegistrationSort = "newest" | "oldest";

function AllOutlets() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<RegistrationSort>("newest");
  const search = q.trim();

  const { data, isLoading } = useQuery({
    queryKey: ["all-outlets", search, sort],
    queryFn: async () => {
      let query = supabase
        .from("outlets")
        .select("id,name,owner_phone,map_location,created_at", { count: "exact" })
        .order("created_at", { ascending: sort === "oldest" })
        .range(0, 199);

      if (search) {
        const safeSearch = search.replace(/[%_]/g, (char) => `\\${char}`);
        query = query.ilike("name", `%${safeSearch}%`);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return { outlets: data ?? [], count: count ?? 0 };
    },
    staleTime: 30_000,
  });

  const outlets = data?.outlets ?? [];
  const count = data?.count ?? 0;

  return (
    <main className="mx-auto min-h-screen max-w-md px-5 pb-8 pt-6">
      <header>
        <Button type="button" variant="ghost" className="-ml-3 mb-2 h-9 px-3" onClick={() => navigate({ to: "/dashboard" })}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Kembali
        </Button>
        <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Manajemen Outlet</div>
        <h1 className="mt-1 text-2xl font-bold">Semua Outlet</h1>
        <p className="mt-1 text-sm text-muted-foreground">{count} outlet terdaftar</p>
      </header>

      <div className="relative mt-5">
        <Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Cari nama toko…" value={q} onChange={(e) => setQ(e.target.value)} className="h-11 pl-9" />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button type="button" variant={sort === "newest" ? "default" : "outline"} className="h-10" onClick={() => setSort("newest")}>Registrasi Terbaru</Button>
        <Button type="button" variant={sort === "oldest" ? "default" : "outline"} className="h-10" onClick={() => setSort("oldest")}>Registrasi Terlama</Button>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" disabled className="h-10 justify-between opacity-70"><span>Jadwal Hari</span><LockKeyhole className="h-4 w-4" /></Button>
        <Button type="button" variant="outline" disabled className="h-10 justify-between opacity-70"><span>Sales</span><LockKeyhole className="h-4 w-4" /></Button>
      </div>

      <p className="mt-2 text-[11px] text-muted-foreground">Filter jadwal hari dan Sales akan aktif setelah struktur penugasan outlet tersedia.</p>

      <div className="mt-4 space-y-2">
        {isLoading && <p className="text-sm text-muted-foreground">Memuat outlet…</p>}
        {!isLoading && outlets.length === 0 && (
          <div className="rounded-2xl border border-dashed p-8 text-center">
            <Store className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">Outlet tidak ditemukan.</p>
          </div>
        )}
        {outlets.map((outlet) => (
          <div key={outlet.id} className="flex items-center gap-2 rounded-xl border bg-card p-2">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
              <Store className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{outlet.name}</div>
              <div className="mt-0.5 text-[10px] text-muted-foreground">
                Terdaftar {new Date(outlet.created_at).toLocaleDateString("id-ID", { dateStyle: "medium" })}
              </div>
              {outlet.owner_phone && <a href={`tel:${outlet.owner_phone}`} className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground"><Phone className="h-3 w-3" />{outlet.owner_phone}</a>}
              {outlet.map_location && <a href={outlet.map_location.startsWith("http") ? outlet.map_location : `https://maps.google.com/?q=${encodeURIComponent(outlet.map_location)}`} target="_blank" rel="noreferrer" className="mt-0.5 flex items-center gap-1 text-[11px] text-accent underline"><MapPin className="h-3 w-3" />Buka peta</a>}
            </div>
            <a
              href={`/outlets/${encodeURIComponent(outlet.id)}/edit`}
              aria-label={`Edit ${outlet.name}`}
              className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-input bg-background px-2.5 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <Pencil className="h-4 w-4" />
              Edit
            </a>
          </div>
        ))}
      </div>
    </main>
  );
}
