import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, LockKeyhole, Wrench } from "lucide-react";
import { getLockedFeature } from "@/lib/feature-locks";
import { useProfile } from "@/hooks/use-profile";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/feature-preview/$feature")({
  head: () => ({
    meta: [
      { title: "Preview Fitur — Sales Pouch" },
      { name: "description", content: "Preview struktur fitur Sales Pouch yang sedang dipersiapkan." },
    ],
  }),
  component: FeaturePreviewPage,
});

function FeaturePreviewPage() {
  const { feature } = Route.useParams();
  const { data: account, isLoading } = useProfile();
  const item = getLockedFeature(feature);

  if (isLoading) return <div className="p-10 text-center">Memuat…</div>;

  if (account?.role !== "owner") {
    return (
      <main className="mx-auto min-h-screen max-w-md px-5 pb-10 pt-10 text-center">
        <LockKeyhole className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="mt-4 text-xl font-bold">Fitur terkunci</h1>
        <p className="mt-2 text-sm text-muted-foreground">Fitur ini belum tersedia untuk akun pelanggan.</p>
        <Button asChild variant="outline" className="mt-6">
          <Link to="/dashboard">Kembali</Link>
        </Button>
      </main>
    );
  }

  if (!item) {
    return (
      <main className="mx-auto min-h-screen max-w-md px-5 pb-10 pt-10">
        <Button asChild variant="ghost" className="px-0">
          <Link to="/dashboard"><ArrowLeft className="mr-1 h-4 w-4" />Kembali</Link>
        </Button>
        <h1 className="mt-5 text-2xl font-bold">Fitur tidak ditemukan</h1>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-md px-5 pb-10 pt-6">
      <Button asChild variant="ghost" className="px-0">
        <Link to="/dashboard"><ArrowLeft className="mr-1 h-4 w-4" />Kembali</Link>
      </Button>

      <section className="mt-6 rounded-3xl border bg-card p-6 text-center shadow-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
          <Wrench className="h-7 w-7 text-muted-foreground" />
        </div>
        <div className="mt-5 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
          <LockKeyhole className="h-3.5 w-3.5" />Preview Owner
        </div>
        <h1 className="mt-4 text-2xl font-bold">{item.label}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
        <div className="mt-6 rounded-2xl bg-muted/60 p-4 text-left">
          <p className="text-sm font-semibold">Status</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Struktur sudah disiapkan. Koneksi data dan aktivasi untuk pelanggan dilakukan bertahap.
          </p>
        </div>
      </section>
    </main>
  );
}
