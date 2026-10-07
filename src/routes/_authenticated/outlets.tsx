import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, Camera, Crosshair, MapPin, Pencil, Phone, Plus, Search, Store } from "lucide-react";
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

const SCHEDULE_DAYS = [
  { value: "1", label: "Senin" },
  { value: "2", label: "Selasa" },
  { value: "3", label: "Rabu" },
  { value: "4", label: "Kamis" },
  { value: "5", label: "Jumat" },
  { value: "6", label: "Sabtu" },
  { value: "7", label: "Minggu" },
];

function AllOutlets() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: account } = useProfile();
  const [sort, setSort] = useState<RegistrationSort>("newest");
  const [scheduleDay, setScheduleDay] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const ownerId = account?.ownerId;
  const [q, setQ] = useState("");
  const search = q.trim();



  const { data, isLoading } = useQuery({
    queryKey: ["all-outlets", search, sort, ownerId, account?.role, account?.userId],
    enabled: !!ownerId && !!account?.userId,
    queryFn: async () => {
      let assignedOutletIds: string[] | null = null;

      if (account?.role === "sales") {
        const { data: assignments, error: assignmentError } = await supabase
          .from("store_schedules")
          .select("outlet_id")
          .eq("owner_id", ownerId!)
          .eq("sales_id", account.userId);

        if (assignmentError) throw assignmentError;
        assignedOutletIds = Array.from(new Set((assignments ?? []).map((item) => item.outlet_id)));

        if (assignedOutletIds.length === 0) {
          return { outlets: [], count: 0 };
        }
      }

      let query = supabase
        .from("outlets")
        .select("id,name,owner_phone,map_location,created_at", { count: "exact" })
        .order("created_at", { ascending: sort === "oldest" })
        .range(0, 199);

      if (assignedOutletIds) {
        query = query.in("id", assignedOutletIds);
      }

      if (search) {
        const safeSearch = search.replace(/[%_]/g, (char) => `\\\\${char}`);
        query = query.ilike("name", `%${safeSearch}%`);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return { outlets: data ?? [], count: count ?? 0 };
    },
    staleTime: 30_000,
  });

  const { data: schedules = [], isLoading: schedulesLoading } = useQuery({
    queryKey: ["all-outlet-schedule-filters", ownerId],
    enabled: !!ownerId,
    queryFn: async () => {
      const client = supabase as any;
      let query = client
        .from("store_schedules")
        .select("outlet_id,sales_id,day_of_week,profiles!store_schedules_sales_id_fkey(display_name,username,user_email)")
        .eq("owner_id", ownerId);
      if (account?.role === "sales" && account.userId) {
        query = query.eq("sales_id", account.userId);
      }
      const { data, error } = await query;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  const filteredOutletIds = schedules
    .filter((item: any) => !scheduleDay || String(item.day_of_week) === scheduleDay)
    .map((item: any) => item.outlet_id);

  const hasScheduleFilter = !!scheduleDay;
  const outlets = (data?.outlets ?? []).filter((outlet) => !hasScheduleFilter || filteredOutletIds.includes(outlet.id));
  const count = data?.count ?? 0;

  if (showCreate) {
    return <InlineCreateOutlet onBack={() => setShowCreate(false)} onSaved={async () => {
      setShowCreate(false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["all-outlets"] }),
        qc.invalidateQueries({ queryKey: ["outlets"] }),
        qc.invalidateQueries({ queryKey: ["dashboard-outlets"] }),
        qc.invalidateQueries({ queryKey: ["warehouse-direct-sale-outlets"] }),
      ]);
    }} />;
  }

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
        <div className="flex items-center justify-between gap-2">
          <Button type="button" variant="ghost" className="-ml-3 h-9 px-3 text-muted-foreground hover:text-foreground" onClick={() => navigate({ to: "/dashboard" })}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Kembali
          </Button>
          <div className="flex items-center gap-2">
            {account?.role !== "sales" && (
              <Button asChild type="button" variant="outline" size="sm" className="rounded-lg">
                <Link to="/schedule">
                  <CalendarDays className="mr-1.5 h-4 w-4" />
                  Jadwal
                </Link>
              </Button>
            )}
            <Button type="button" size="sm" className="rounded-lg shadow-xs" onClick={() => setShowCreate(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              Tambah Outlet
            </Button>
          </div>
        </div>
        <div className="mt-3">
          <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Manajemen Toko</div>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight">Semua Outlet</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">{count} warung/toko terdaftar</p>
        </div>
      </header>

      <div className="relative mt-5">
        <Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Cari nama toko…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-11 pl-9"
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button type="button" variant={sort === "newest" ? "default" : "outline"} className="h-10" onClick={() => setSort("newest")}>Registrasi Terbaru</Button>
        <Button type="button" variant={sort === "oldest" ? "default" : "outline"} className="h-10" onClick={() => setSort("oldest")}>Registrasi Terlama</Button>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <select
          value={scheduleDay}
          onChange={(e) => setScheduleDay(e.target.value)}
          className={`h-10 w-full rounded-md border bg-background px-3 text-sm ${scheduleDay ? "font-medium" : "text-muted-foreground"}`}
          aria-label="Filter Jadwal Hari"
          disabled={schedulesLoading}
        >
          <option value="">Jadwal Hari</option>
          {SCHEDULE_DAYS.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}
        </select>

      </div>

      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>{hasScheduleFilter ? `${outlets.length} outlet sesuai filter` : "Filter berdasarkan jadwal kunjungan"}</span>
        {hasScheduleFilter && <button type="button" className="underline" onClick={() => setScheduleDay("")}>Reset</button>}
      </div>

      <div className="mt-4 space-y-2">
        {isLoading && <p className="text-sm text-muted-foreground">Memuat outlet…</p>}
        {!isLoading && outlets.length === 0 && (
          <div className="rounded-xl border border-dashed bg-card/50 p-8 text-center">
            <Store className="mx-auto h-9 w-9 text-muted-foreground" />
            <div className="mt-3 text-sm font-semibold">
              {hasScheduleFilter ? "Tidak ada outlet di jadwal ini" : "Outlet tidak ditemukan"}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              "Belum ada outlet yang ditambahkan ke sistem."
            </p>
            <Button type="button" size="sm" className="mt-4 rounded-lg" onClick={() => setShowCreate(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              Daftarkan Toko Baru
            </Button>
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

function InlineCreateOutlet({ onBack, onSaved }: { onBack: () => void; onSaved: () => Promise<void> | void }) {
  const { data: account, isLoading: accountLoading } = useProfile();
  const [name, setName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [map, setMap] = useState("");
  const [routeNotes, setRouteNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  function useGps() {
    if (!navigator.geolocation) { toast.error("GPS tidak tersedia di perangkat ini."); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setMap(`https://maps.google.com/?q=${pos.coords.latitude},${pos.coords.longitude}`); setLocating(false); },
      (err) => { toast.error(err.message); setLocating(false); },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (accountLoading || !account?.ownerId) { toast.error("Data akun belum siap. Silakan muat ulang."); return; }
    if (!["owner", "admin", "manager", "sales"].includes(account.role)) { toast.error("Anda tidak memiliki akses untuk menambah outlet."); return; }
    if (!name.trim()) { toast.error("Nama outlet wajib diisi."); return; }
    setBusy(true);
    try {
      let storePhoto: string | null = null;
      if (file) {
        try {
          storePhoto = await uploadStorePhoto(file);
        } catch (photoErr) {
          console.warn("Gagal unggah foto:", photoErr);
          toast.error("Foto gagal diunggah, outlet tetap disimpan tanpa foto.");
        }
      }

      const { data, error } = await supabase.from("outlets").insert({
        user_id: account.ownerId,
        name: name.trim(),
        owner_name: ownerName.trim() || null,
        owner_phone: phone.trim() || null,
        address: address.trim() || null,
        map_location: map.trim() || null,
        route_notes: routeNotes.trim() || null,
        store_photo: storePhoto,
      }).select("id").single();
      if (error) throw error;
      if (!data?.id) throw new Error("Outlet gagal mendapatkan ID.");
      toast.success("Outlet berhasil ditambahkan");
      await onSaved();
    } catch (err) {
      toast.error(`Gagal menyimpan outlet: ${(err as Error).message}`);
    } finally { setBusy(false); }
  }

  return <main className="mx-auto min-h-screen max-w-md px-5 pb-10 pt-6">
    <Button type="button" variant="ghost" className="-ml-3 h-9 px-3" onClick={onBack}><ArrowLeft className="mr-2 h-4 w-4" />Kembali ke Semua Outlet</Button>
    <h1 className="mt-4 text-2xl font-bold">Tambah Outlet</h1>
    <form onSubmit={save} className="mt-6 space-y-4">
      <label className="flex aspect-video cursor-pointer flex-col items-center justify-center overflow-hidden rounded-md border-2 border-dashed bg-card">
        {file ? <img src={URL.createObjectURL(file)} alt="Foto outlet" className="h-full w-full object-cover" /> : <><Camera className="h-8 w-8 text-muted-foreground" /><span className="mt-2 text-sm text-muted-foreground">Foto outlet (opsional)</span><span className="mt-1 text-[10px] text-muted-foreground">Otomatis dikompres agar ringan</span></>}
        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
      <div className="space-y-2"><Label>Nama Outlet *</Label><Input required value={name} onChange={(e) => setName(e.target.value)} className="h-12" placeholder="Contoh: Toko Makmur" /></div>
      <div className="space-y-2"><Label>Nama Pemilik</Label><Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} className="h-12" /></div>
      <div className="space-y-2"><Label>No. HP Pemilik</Label><Input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="08xx" className="h-12" /></div>
      <div className="space-y-2"><Label>Alamat Toko</Label><Textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={3} /></div>
      <div className="space-y-2"><Label>Lokasi</Label><div className="flex gap-2"><Input value={map} onChange={(e) => setMap(e.target.value)} placeholder="Link Google Maps" className="h-12" /><Button type="button" variant="secondary" className="h-12 shrink-0" onClick={useGps} disabled={locating}><Crosshair className="h-4 w-4" />{locating ? "…" : "GPS"}</Button></div></div>
      <div className="space-y-2"><Label>Catatan Rute</Label><Textarea value={routeNotes} onChange={(e) => setRouteNotes(e.target.value)} rows={3} placeholder="Patokan menuju toko" /></div>
      <Button type="submit" disabled={busy || !name.trim()} className="h-14 w-full text-base">{busy ? "Menyimpan…" : "Simpan Outlet"}</Button>
    </form>
  </main>;
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
