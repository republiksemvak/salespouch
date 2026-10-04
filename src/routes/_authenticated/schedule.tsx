import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/schedule")({
  head: () => ({ meta: [{ title: "Jadwal Toko — Sales Pouch" }, { name: "description", content: "Jadwal kunjungan toko dan PIC Sales." }] }),
  component: SchedulePage,
});

const DAYS = [
  { value: 1, label: "Senin" },
  { value: 2, label: "Selasa" },
  { value: 3, label: "Rabu" },
  { value: 4, label: "Kamis" },
  { value: 5, label: "Jumat" },
  { value: 6, label: "Sabtu" },
  { value: 7, label: "Minggu" },
];

function SchedulePage() {
  const { data: profile, isLoading: profileLoading } = useProfile();
  const qc = useQueryClient();
  const ownerId = profile?.ownerId;
  const isOwner = profile?.role === "owner";
  const [day, setDay] = useState(1);
  const [outletId, setOutletId] = useState("");
  const [salesId, setSalesId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: outlets = [], isLoading: outletsLoading } = useQuery({
    queryKey: ["schedule-outlets", ownerId],
    enabled: !!ownerId,
    queryFn: async () => {
      const { data, error } = await supabase.from("outlets").select("id,name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: members = [], isLoading: membersLoading } = useQuery({
    queryKey: ["schedule-team", ownerId],
    enabled: !!ownerId && isOwner,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_members")
        .select("user_id,profiles!team_members_user_id_fkey(display_name,username,user_email)")
        .eq("owner_id", ownerId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: schedules = [], isLoading: schedulesLoading } = useQuery({
    queryKey: ["store-schedules", ownerId],
    enabled: !!ownerId,
    queryFn: async () => {
      const client = supabase as any;
      const { data, error } = await client
        .from("store_schedules")
        .select("id,outlet_id,sales_id,day_of_week,note,outlets(name),profiles!store_schedules_sales_id_fkey(display_name,username,user_email)")
        .eq("owner_id", ownerId)
        .order("day_of_week")
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const grouped = useMemo(() => DAYS.map((d) => ({
    ...d,
    items: schedules.filter((item: any) => item.day_of_week === d.value),
  })), [schedules]);

  async function addSchedule(e: React.FormEvent) {
    e.preventDefault();
    if (!ownerId || !outletId || !salesId) return;
    setBusy(true);
    try {
      const client = supabase as any;
      const { error } = await client.from("store_schedules").insert({
        owner_id: ownerId,
        outlet_id: outletId,
        sales_id: salesId,
        day_of_week: day,
        note: note.trim() || null,
      });
      if (error) throw error;
      setNote("");
      toast.success("Jadwal toko ditambahkan");
      qc.invalidateQueries({ queryKey: ["store-schedules", ownerId] });
    } catch (error) {
      if ((error as { code?: string }).code === "23505") toast.error("Jadwal toko untuk PIC dan hari tersebut sudah ada.");
      else toast.error((error as Error).message || "Jadwal gagal disimpan.");
    } finally {
      setBusy(false);
    }
  }

  async function removeSchedule(id: string) {
    if (!confirm("Hapus jadwal toko ini?")) return;
    try {
      const { error } = await (supabase as any).from("store_schedules").delete().eq("id", id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["store-schedules", ownerId] });
      toast.success("Jadwal dihapus");
    } catch (error) {
      toast.error((error as Error).message || "Jadwal gagal dihapus.");
    }
  }

  if (profileLoading) return <main className="mx-auto max-w-md px-5 py-10 text-sm text-muted-foreground">Memuat...</main>;

  return (
    <main className="mx-auto min-h-screen max-w-md px-5 pb-10 pt-6">
      <a href="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" />Kembali</a>
      <header className="mt-4">
        <div className="flex items-center gap-2"><CalendarDays className="h-5 w-5" /><h1 className="text-2xl font-bold">Jadwal Toko</h1></div>
        <p className="mt-1 text-sm text-muted-foreground">Atur hari kunjungan toko dan PIC Sales. Tidak perlu jam.</p>
      </header>

      {isOwner && (
        <form onSubmit={addSchedule} className="mt-6 space-y-3 rounded-2xl border bg-card p-4">
          <h2 className="font-semibold">Tambah Jadwal</h2>
          <select value={day} onChange={(e) => setDay(Number(e.target.value))} className="h-11 w-full rounded-md border bg-background px-3 text-sm">
            {DAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
          <select required value={outletId} onChange={(e) => setOutletId(e.target.value)} className="h-11 w-full rounded-md border bg-background px-3 text-sm">
            <option value="">Pilih toko</option>
            {outlets.map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <select required value={salesId} onChange={(e) => setSalesId(e.target.value)} className="h-11 w-full rounded-md border bg-background px-3 text-sm">
            <option value="">Pilih PIC / Sales</option>
            {members.map((m: any) => <option key={m.user_id} value={m.user_id}>{m.profiles?.display_name ?? m.profiles?.username ?? m.profiles?.user_email ?? "Sales"}</option>)}
          </select>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Catatan (opsional)" className="h-11" />
          <Button disabled={busy || outletsLoading || membersLoading} className="h-11 w-full"><Plus className="mr-2 h-4 w-4" />{busy ? "Menyimpan..." : "Tambah Jadwal"}</Button>
        </form>
      )}

      <section className="mt-6 space-y-4">
        {schedulesLoading && <p className="text-sm text-muted-foreground">Memuat jadwal...</p>}
        {!schedulesLoading && grouped.every((d) => d.items.length === 0) && <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">Belum ada jadwal toko.</div>}
        {grouped.map((d) => d.items.length > 0 && (
          <div key={d.value}>
            <h2 className="mb-2 font-semibold">{d.label}</h2>
            <div className="space-y-2">
              {d.items.map((item: any) => <div key={item.id} className="rounded-xl border bg-card p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold">{item.outlets?.name ?? "Toko"}</div>
                    <div className="mt-1 text-xs text-muted-foreground">PIC: {item.profiles?.display_name ?? item.profiles?.username ?? item.profiles?.user_email ?? "Sales"}</div>
                    {item.note && <div className="mt-1 text-xs text-muted-foreground">{item.note}</div>}
                  </div>
                  {isOwner && <Button variant="ghost" size="icon" aria-label="Hapus jadwal" onClick={() => removeSchedule(item.id)}><Trash2 className="h-4 w-4" /></Button>}
                </div>
              </div>)}
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
