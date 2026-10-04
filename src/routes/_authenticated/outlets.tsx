import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Camera, Crosshair, MapPin, Pencil, Phone, Search, Store, LockKeyhole } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { signedPhotoUrls, uploadStorePhoto } from "@/lib/photos";
import { useProfile } from "@/hooks/use-profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/outlets")({
  head: () => ({
    meta: [{ title: "Semua Outlet — Sales Pouch" }, { name: "description", content: "Daftar seluruh outlet terdaftar." }, { property: "og:title", content: "Semua Outlet — Sales Pouch" }, { property: "og:description", content: "Daftar seluruh outlet terdaftar." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }],
  }),
  component: AllOutlets,
});

type RegistrationSort = "newest" | "oldest";

type OutletProfile = {
  id: string;
  name: string;
  owner_name: string | null;
  owner_phone: string | null;
  address: string | null;
  map_location: string | null;
  route_notes: string | null;
  store_photo: string | null;
  photoUrl?: string;
};

function AllOutlets() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<RegistrationSort>("newest");
  const [editingId, setEditingId] = useState<string | null>(null);
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

  if (editingId) {
    return (
      <InlineEditOutlet
        id={editingId}
        onBack={() => setEditingId(null)}
        onSaved={async () => {
          setEditingId(null);
          await Promise.all([
            qc.invalidateQueries({ queryKey: ["all-outlets"] }),
            qc.invalidateQueries({ queryKey: ["outlets"] }),
            qc.invalidateQueries({ queryKey: ["dashboard-outlets"] }),
          ]);
        }}
      />
    );
  }

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
            <Button type="button" variant="outline" aria-label={`Edit ${outlet.name}`} className="h-9 shrink-0 gap-1.5 px-2.5 text-sm" onClick={() => setEditingId(outlet.id)}>
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
          </div>
        ))}
      </div>
    </main>
  );
}

function InlineEditOutlet({ id, onBack, onSaved }: { id: string; onBack: () => void; onSaved: () => Promise<void> | void }) {
  const { data: account, isLoading: accountLoading } = useProfile();
  const [outlet, setOutlet] = useState<OutletProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [map, setMap] = useState("");
  const [routeNotes, setRouteNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase
        .from("outlets")
        .select("id,name,owner_name,owner_phone,address,map_location,route_notes,store_photo")
        .eq("id", id)
        .single();
      if (!active) return;
      if (error || !data) {
        setError(error?.message ?? "Toko tidak ditemukan.");
        setLoading(false);
        return;
      }
      let photoUrl: string | undefined;
      if (data.store_photo) {
        const photos = await signedPhotoUrls([data.store_photo]);
        photoUrl = photos[data.store_photo];
      }
      if (!active) return;
      const item = { ...data, photoUrl } as OutletProfile;
      setOutlet(item);
      setName(item.name);
      setOwnerName(item.owner_name ?? "");
      setPhone(item.owner_phone ?? "");
      setAddress(item.address ?? "");
      setMap(item.map_location ?? "");
      setRouteNotes(item.route_notes ?? "");
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [id]);

  function useGps() {
    if (!navigator.geolocation) {
      toast.error("GPS tidak tersedia di perangkat ini.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setMap(`https://maps.google.com/?q=${pos.coords.latitude},${pos.coords.longitude}`);
        setLocating(false);
      },
      (err) => {
        toast.error(err.message);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (accountLoading || !outlet) return;
    if (account?.role !== "owner") {
      toast.error("Hanya Owner yang dapat mengedit profil toko.");
      return;
    }
    if (!name.trim()) {
      toast.error("Nama toko wajib diisi.");
      return;
    }
    setBusy(true);
    try {
      const storePhoto = file ? await uploadStorePhoto(file) : outlet.store_photo;
      const { data: updated, error: updateError } = await supabase
        .from("outlets")
        .update({
          name: name.trim(),
          owner_name: ownerName.trim() || null,
          owner_phone: phone.trim() || null,
          address: address.trim() || null,
          map_location: map.trim() || null,
          route_notes: routeNotes.trim() || null,
          store_photo: storePhoto,
        })
        .eq("id", id)
        .select("id,name,owner_name,owner_phone,address,map_location,route_notes,store_photo")
        .single();
      if (updateError) throw updateError;
      if (!updated) throw new Error("Perubahan toko tidak tersimpan.");
      toast.success("Profil toko berhasil diperbarui");
      await onSaved();
    } catch (err) {
      toast.error(`Gagal menyimpan: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  if (accountLoading || loading) return <p className="p-10 text-center text-muted-foreground">Memuat profil toko…</p>;
  if (error || !outlet) return <main className="mx-auto max-w-md px-5 pt-8"><Button variant="ghost" onClick={onBack}><ArrowLeft className="mr-2 h-4 w-4" />Kembali</Button><p className="mt-6 text-center text-destructive">Toko tidak ditemukan.</p></main>;
  if (account?.role !== "owner") return <main className="mx-auto max-w-md px-5 pt-8"><Button variant="ghost" onClick={onBack}><ArrowLeft className="mr-2 h-4 w-4" />Kembali</Button><p className="mt-6 text-center text-muted-foreground">Hanya Owner yang dapat mengedit profil toko.</p></main>;

  const preview = file ? URL.createObjectURL(file) : outlet.photoUrl;

  return (
    <main className="mx-auto min-h-screen max-w-md px-5 pb-10 pt-6">
      <Button type="button" variant="ghost" className="-ml-3 h-9 px-3" onClick={onBack}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Kembali ke Semua Outlet
      </Button>
      <h1 className="mt-4 text-2xl font-bold">Edit Profil Toko</h1>
      <form onSubmit={save} className="mt-6 space-y-5">
        <label className="flex aspect-video cursor-pointer flex-col items-center justify-center overflow-hidden rounded-md border-2 border-dashed bg-card">
          {preview ? <img src={preview} alt="Foto toko" className="h-full w-full object-cover" /> : <><Camera className="h-8 w-8 text-muted-foreground" /><span className="mt-2 text-sm text-muted-foreground">Foto toko (opsional)</span></>}
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <div className="space-y-2"><Label>Nama Toko *</Label><Input required value={name} onChange={(e) => setName(e.target.value)} className="h-12" /></div>
        <div className="space-y-2"><Label>Nama Pemilik</Label><Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} className="h-12" /></div>
        <div className="space-y-2"><Label>Nomor Telepon</Label><Input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="08xx" className="h-12" /></div>
        <div className="space-y-2"><Label>Alamat Toko</Label><Textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={3} /></div>
        <div className="space-y-2"><Label>Lokasi Peta</Label><div className="flex gap-2"><Input value={map} onChange={(e) => setMap(e.target.value)} placeholder="Tautan Google Maps" className="h-12" /><Button type="button" variant="secondary" className="h-12 shrink-0" onClick={useGps} disabled={locating}><Crosshair className="h-4 w-4" />{locating ? "…" : "GPS"}</Button></div></div>
        <div className="space-y-2"><Label>Catatan Rute</Label><Textarea value={routeNotes} onChange={(e) => setRouteNotes(e.target.value)} placeholder="Patokan atau petunjuk menuju toko" rows={4} /></div>
        <Button type="submit" disabled={busy || !name.trim()} className="h-14 w-full text-base">{busy ? "Menyimpan…" : "Simpan Perubahan"}</Button>
      </form>
    </main>
  );
}
