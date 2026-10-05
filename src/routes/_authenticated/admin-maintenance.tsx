import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Construction, Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/admin-maintenance")({
  head: () => ({
    meta: [
      { title: "Maintenance — Super Admin Sales Pouch" },
      { name: "description", content: "Panel maintenance khusus Super Admin." },
    ],
  }),
  component: AdminMaintenancePage,
});

type Maintenance = {
  id: number;
  enabled: boolean;
  title: string;
  message: string;
  eta: string | null;
};

function AdminMaintenancePage() {
  const { data: isAdmin, isLoading: adminLoading } = useIsAdmin();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["system-maintenance"],
    enabled: !!isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_maintenance")
        .select("id, enabled, title, message, eta")
        .eq("id", 1)
        .single();
      if (error) throw error;
      return data as Maintenance;
    },
  });

  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [eta, setEta] = useState("");
  const [saving, setSaving] = useState(false);

  const currentEnabled = enabled ?? data?.enabled ?? false;
  const currentTitle = title || data?.title || "";
  const currentMessage = message || data?.message || "";
  const currentEta = eta || data?.eta || "";

  if (adminLoading || (isAdmin && isLoading)) {
    return <div className="p-10 text-center text-muted-foreground">Memuat…</div>;
  }

  if (!isAdmin) {
    return <div className="p-10 text-center text-destructive">Halaman ini khusus Super Admin.</div>;
  }

  async function save() {
    if (!currentTitle.trim() || !currentMessage.trim()) {
      toast.error("Judul dan pesan wajib diisi");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("system_maintenance")
      .update({
        enabled: currentEnabled,
        title: currentTitle.trim(),
        message: currentMessage.trim(),
        eta: currentEta.trim() || null,
      })
      .eq("id", 1);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await qc.invalidateQueries({ queryKey: ["system-maintenance"] });
    setEnabled(null);
    setTitle("");
    setMessage("");
    setEta("");
    toast.success("Pengaturan maintenance berhasil disimpan");
  }

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-5 pb-16 pt-6">
      <Link to="/admin" className="flex items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeft className="h-4 w-4" />
        Kembali ke Super Admin
      </Link>

      <div className="mt-5 flex items-start gap-3">
        <div className="rounded-2xl bg-orange-100 p-3 text-orange-700">
          <Construction className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Maintenance / Under Construction</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Panel ini hanya dapat dibuka oleh Super Admin. Pengaturan disimpan di database agar tetap berlaku setelah refresh dan login ulang.
          </p>
        </div>
      </div>

      <section className="mt-6 rounded-2xl border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4 rounded-xl border bg-muted/30 p-4">
          <div>
            <div className="font-semibold">Mode Maintenance</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {currentEnabled ? "Status aktif" : "Status nonaktif"}
            </div>
          </div>
          <Switch checked={currentEnabled} onCheckedChange={setEnabled} />
        </div>

        <div className="mt-5 space-y-4">
          <div className="space-y-2">
            <Label>Judul halaman</Label>
            <Input
              value={currentTitle}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Sedang Dalam Pemeliharaan"
              className="h-12"
              maxLength={120}
            />
          </div>

          <div className="space-y-2">
            <Label>Pesan</Label>
            <Textarea
              value={currentMessage}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Kami sedang melakukan perbaikan dan pengembangan sistem."
              rows={5}
              maxLength={500}
            />
          </div>

          <div className="space-y-2">
            <Label>Perkiraan selesai <span className="text-muted-foreground">(opsional)</span></Label>
            <Input
              value={currentEta}
              onChange={(e) => setEta(e.target.value)}
              placeholder="Contoh: Hari ini pukul 22.00 WIB"
              className="h-12"
              maxLength={120}
            />
          </div>
        </div>

        <Button className="mt-5 h-12 w-full" onClick={save} disabled={saving}>
          {saving ? "Menyimpan…" : <><Save className="mr-2 h-4 w-4" />Simpan Pengaturan</>}
        </Button>
      </section>

      <div className="mt-4 flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div>
          <div className="font-semibold">Akses dikunci di dua lapis</div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Route memeriksa akun Super Admin, dan tabel database juga hanya mengizinkan akun Super Admin membaca atau mengubah konfigurasi.
          </p>
        </div>
      </div>
    </main>
  );
}
