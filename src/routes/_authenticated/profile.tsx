import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useProfile, profileQueryKey } from "@/hooks/use-profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { StockScheme } from "@/lib/access";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Profil Usaha — Sales Pouch" },
      { name: "description", content: "Edit profil usaha Anda." },
      { property: "og:title", content: "Profil Usaha — Sales Pouch" },
      { property: "og:description", content: "Edit profil usaha Anda." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { data: account, isLoading } = useProfile();
  if (isLoading) return <div className="p-10 text-center">Memuat…</div>;
  if (account?.role !== "owner")
    return <div className="p-10 text-center text-destructive">Hanya Owner yang dapat mengubah profil usaha.</div>;
  return <OwnerProfilePage />;
}

function OwnerProfilePage() {
  const { data: p, isLoading } = useProfile();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [stockScheme, setStockScheme] = useState<StockScheme>("clean_pull");
  const [busy, setBusy] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);

  useEffect(() => {
    if (!p?.profile) return;
    setName(p.profile.business_name ?? "");
    setAddress(p.profile.business_address ?? "");
    setPhone(p.profile.business_phone ?? "");
    setStockScheme(p.profile.stock_scheme === "accumulation" ? "accumulation" : "clean_pull");
  }, [p]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Nama usaha wajib diisi");
      return;
    }
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      setBusy(false);
      toast.error("Akun tidak ditemukan");
      return;
    }
    const { error } = await supabase
      .from("profiles")
      .update({
        business_name: name.trim(),
        business_address: address.trim() || null,
        business_phone: phone.trim() || null,
        stock_scheme: stockScheme,
      })
      .eq("id", u.user.id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Profil usaha disimpan");
    qc.invalidateQueries({ queryKey: profileQueryKey });
  }

  async function resetPassword() {
    if (newPassword.length < 6) {
      toast.error("Password minimal 6 karakter");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Konfirmasi password tidak sama");
      return;
    }

    setPasswordBusy(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPasswordBusy(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    setNewPassword("");
    setConfirmPassword("");
    setPasswordOpen(false);
    toast.success("Password berhasil diubah");
  }

  return (
    <main className="mx-auto min-h-screen max-w-md px-5 pb-10 pt-6">
      <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeft className="h-4 w-4" />
        Kembali
      </Link>
      <h1 className="mt-4 text-2xl font-bold">Profil Usaha</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Atur identitas usaha dan cara stok konsinyasi dikelola.
      </p>
      {isLoading ? (
        <p className="mt-6 text-sm text-muted-foreground">Memuat…</p>
      ) : (
        <form onSubmit={save} className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label>Nama Usaha</Label>
            <Input required value={name} maxLength={80} onChange={(e) => setName(e.target.value)} className="h-12" />
          </div>
          <div className="space-y-2">
            <Label>Alamat Usaha</Label>
            <Textarea
              value={address}
              maxLength={200}
              onChange={(e) => setAddress(e.target.value)}
              rows={2}
              placeholder="cth. Jl. Merdeka No. 10, Bandung"
            />
          </div>
          <div className="space-y-2">
            <Label>No. Telepon</Label>
            <Input
              value={phone}
              maxLength={20}
              inputMode="tel"
              onChange={(e) => setPhone(e.target.value)}
              placeholder="cth. 0812xxxxxxx"
              className="h-12"
            />
          </div>

          <div className="space-y-2">
            <Label>Skema Stok Toko</Label>
            <div className="grid gap-2">
              <Button
                type="button"
                variant={stockScheme === "accumulation" ? "default" : "outline"}
                onClick={() => setStockScheme("accumulation")}
                className="h-auto min-h-20 flex-col items-start whitespace-normal px-4 py-3 text-left"
              >
                <span className="font-semibold">1. Akumulasi</span>
                <span className="text-xs font-normal opacity-85">
                  Sisa kemarin tetap jadi stok toko + titipan baru. Retur hanya jika ada fisik barang ditarik ke gudang.
                </span>
              </Button>
              <Button
                type="button"
                variant={stockScheme === "clean_pull" ? "default" : "outline"}
                onClick={() => setStockScheme("clean_pull")}
                className="h-auto min-h-20 flex-col items-start whitespace-normal px-4 py-3 text-left"
              >
                <span className="font-semibold">2. Tarik Bersih (Default)</span>
                <span className="text-xs font-normal opacity-85">
                  Semua sisa lama otomatis ditarik kembali ke gudang; stok toko berikutnya murni dari titipan baru.
                </span>
              </Button>
            </div>
          </div>

          <Button disabled={busy} className="h-12 w-full">
            {busy ? "Menyimpan…" : "Simpan"}
          </Button>
        </form>
      )}

      <div className="mt-6 rounded-2xl border bg-card p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-muted p-2">
            <LockKeyhole className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">Password</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Ganti password akun Anda tanpa mengubah data usaha.
            </p>
            <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
              <DialogTrigger asChild>
                <Button type="button" variant="outline" className="mt-3 w-full">
                  Reset Password
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-sm">
                <DialogHeader>
                  <DialogTitle>Reset Password</DialogTitle>
                  <DialogDescription>
                    Masukkan password baru untuk akun Anda. Minimal 6 karakter.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label>Password Baru</Label>
                    <Input
                      type="password"
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Minimal 6 karakter"
                      className="h-12"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Konfirmasi Password</Label>
                    <Input
                      type="password"
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Ulangi password baru"
                      className="h-12"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setPasswordOpen(false)} disabled={passwordBusy}>
                    Batal
                  </Button>
                  <Button type="button" onClick={resetPassword} disabled={passwordBusy}>
                    {passwordBusy ? "Menyimpan…" : "Simpan Password"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>
    </main>
  );
}
