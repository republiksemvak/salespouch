import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Camera, Crosshair } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { signedPhotoUrls, uploadStorePhoto } from "@/lib/photos";
import { useProfile } from "@/hooks/use-profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/outlets/$id/edit")({
  head: () => ({
    meta: [
      { title: "Edit Profil Toko — Sales Pouch" },
      { name: "description", content: "Ubah profil dan petunjuk kunjungan toko." },
      { property: "og:title", content: "Edit Profil Toko — Sales Pouch" },
      { property: "og:description", content: "Ubah profil dan petunjuk kunjungan toko." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EditOutletPage,
});

function EditOutletPage() {
  const { id } = Route.useParams();
  const { data: account, isLoading: accountLoading } = useProfile();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [map, setMap] = useState("");
  const [routeNotes, setRouteNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);

  const { data: outlet, isLoading, error } = useQuery({
    queryKey: ["outlet-profile", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("outlets")
        .select("id,name,owner_name,owner_phone,address,map_location,route_notes,store_photo")
        .eq("id", id)
        .single();
      if (error) throw error;

      let photoUrl: string | undefined;
      if (data.store_photo) {
        const photos = await signedPhotoUrls([data.store_photo]);
        photoUrl = photos[data.store_photo];
      }
      return { ...data, photoUrl };
    },
  });

  useEffect(() => {
    if (!outlet) return;
    setName(outlet.name);
    setOwnerName(outlet.owner_name ?? "");
    setPhone(outlet.owner_phone ?? "");
    setAddress(outlet.address ?? "");
    setMap(outlet.map_location ?? "");
    setRouteNotes(outlet.route_notes ?? "");
  }, [outlet]);

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
    if (accountLoading) return;
    if (!outlet) {
      toast.error("Data toko belum siap. Coba lagi.");
      return;
    }
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

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["all-outlets"] }),
        qc.invalidateQueries({ queryKey: ["outlets"] }),
        qc.invalidateQueries({ queryKey: ["outlet-profile", id] }),
        qc.invalidateQueries({ queryKey: ["dashboard-outlets"] }),
      ]);

      toast.success("Profil toko berhasil diperbarui");
      navigate({ to: "/outlets" });
    } catch (err) {
      toast.error(`Gagal menyimpan: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  if (accountLoading || isLoading) {
    return <p className="p-10 text-center text-muted-foreground">Memuat profil toko…</p>;
  }
  if (error || !outlet) {
    return <p className="p-10 text-center text-destructive">Toko tidak ditemukan.</p>;
  }
  if (account?.role !== "owner") {
    return <p className="p-10 text-center text-muted-foreground">Hanya Owner yang dapat mengedit profil toko.</p>;
  }

  const preview = file ? URL.createObjectURL(file) : outlet.photoUrl;

  return (
    <main className="mx-auto min-h-screen max-w-md px-5 pb-10 pt-6">
      <Link to="/outlets" className="inline-flex items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeft className="h-4 w-4" />
        Kembali ke Semua Outlet
      </Link>
      <h1 className="mt-4 text-2xl font-bold">Edit Profil Toko</h1>

      <form onSubmit={save} className="mt-6 space-y-5">
        <label className="flex aspect-video cursor-pointer flex-col items-center justify-center overflow-hidden rounded-md border-2 border-dashed bg-card">
          {preview ? (
            <img src={preview} alt="Foto toko" className="h-full w-full object-cover" />
          ) : (
            <>
              <Camera className="h-8 w-8 text-muted-foreground" />
              <span className="mt-2 text-sm text-muted-foreground">Foto toko (opsional)</span>
            </>
          )}
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>

        <div className="space-y-2">
          <Label>Nama Toko *</Label>
          <Input required value={name} onChange={(e) => setName(e.target.value)} className="h-12" />
        </div>
        <div className="space-y-2">
          <Label>Nama Pemilik</Label>
          <Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} className="h-12" />
        </div>
        <div className="space-y-2">
          <Label>Nomor Telepon</Label>
          <Input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="08xx" className="h-12" />
        </div>
        <div className="space-y-2">
          <Label>Alamat Toko</Label>
          <Textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={3} />
        </div>
        <div className="space-y-2">
          <Label>Lokasi Peta</Label>
          <div className="flex gap-2">
            <Input value={map} onChange={(e) => setMap(e.target.value)} placeholder="Tautan Google Maps" className="h-12" />
            <Button type="button" variant="secondary" className="h-12 shrink-0" onClick={useGps} disabled={locating}>
              <Crosshair className="h-4 w-4" />
              {locating ? "…" : "GPS"}
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          <Label>Catatan Rute</Label>
          <Textarea value={routeNotes} onChange={(e) => setRouteNotes(e.target.value)} placeholder="Patokan atau petunjuk menuju toko" rows={4} />
        </div>

        <Button type="submit" disabled={busy || !name.trim()} className="h-14 w-full text-base">
          {busy ? "Menyimpan…" : "Simpan Perubahan"}
        </Button>
      </form>
    </main>
  );
}
