import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Camera, Crosshair } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { uploadStorePhoto } from "@/lib/photos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/outlets/new")({
  head: () => ({ meta: [{ title: "Tambah Outlet — Sales Pouch" }, { name: "description", content: "Tambah outlet baru." }, { property: "og:title", content: "Tambah Outlet — Sales Pouch" }, { property: "og:description", content: "Tambah outlet baru." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: NewOutlet,
});

function NewOutlet() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [map, setMap] = useState("");
  const [phone, setPhone] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);

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
    setBusy(true);
    try {
      const store_photo = file ? await uploadStorePhoto(file) : null;
      const { error } = await supabase.from("outlets").insert({
        name: name.trim(), map_location: map.trim() || null, owner_phone: phone.trim() || null, store_photo,
      });
      if (error) throw error;
      toast.success("Outlet ditambahkan");
      qc.invalidateQueries({ queryKey: ["outlets"] });
      navigate({ to: "/dashboard" });
    } catch (err) { toast.error((err as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <main className="mx-auto min-h-screen max-w-md px-5 pb-10 pt-6">
      <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" />Kembali</Link>
      <h1 className="mt-4 text-2xl font-bold">Tambah Outlet</h1>
      <form onSubmit={save} className="mt-6 space-y-5">
        <label className="flex aspect-video cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed bg-card">
          {file ? <img src={URL.createObjectURL(file)} alt="Foto toko" className="h-full w-full object-cover" />
            : <><Camera className="h-8 w-8 text-muted-foreground" /><span className="mt-2 text-sm text-muted-foreground">Foto toko (opsional)</span></>}
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <div className="space-y-2"><Label>Nama Outlet *</Label><Input required value={name} onChange={(e) => setName(e.target.value)} className="h-12" /></div>
        <div className="space-y-2"><Label>No. HP Pemilik</Label><Input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="08xx" className="h-12" /></div>
        <div className="space-y-2">
          <Label>Lokasi (link Google Maps)</Label>
          <div className="flex gap-2">
            <Input value={map} onChange={(e) => setMap(e.target.value)} placeholder="https://maps.app.goo.gl/…" className="h-12" />
            <Button type="button" variant="secondary" className="h-12 shrink-0" onClick={useGps} disabled={locating}>
              <Crosshair className="h-4 w-4" />{locating ? "…" : "GPS"}
            </Button>
          </div>
        </div>
        <Button disabled={busy || !name.trim()} className="h-14 w-full text-base">{busy ? "Menyimpan…" : "Simpan Outlet"}</Button>
      </form>
    </main>
  );
}
