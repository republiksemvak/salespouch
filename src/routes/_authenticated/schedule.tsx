import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, CheckCircle2, GripVertical, Plus, Trash2 } from "lucide-react";
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
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragPointerId = useRef<number | null>(null);
  const dragCandidateId = useRef<string | null>(null);
  const dragStartPoint = useRef({ x: 0, y: 0 });
  const dragOverRef = useRef<string | null>(null);

  const today = new Date();
  const todayDay = today.getDay() || 7;
  const todayStart = new Date(today);
  todayStart.setHours(0, 0, 0, 0);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);

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
        .eq("owner_id", ownerId ?? "")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: schedules = [], isLoading: schedulesLoading } = useQuery({
    queryKey: ["store-schedules", ownerId, profile?.userId, profile?.role],
    enabled: !!ownerId,
    queryFn: async () => {
      const client = supabase as any;
      let query = client
        .from("store_schedules")
        .select("id,outlet_id,sales_id,day_of_week,note,visit_order,outlets(name),profiles!store_schedules_sales_id_fkey(display_name,username,user_email)")
        .eq("owner_id", ownerId)
        .order("day_of_week")
        .order("visit_order", { ascending: true, nullsFirst: false })
        .order("created_at");
      if (!isOwner && profile?.userId) query = query.eq("sales_id", profile.userId).eq("day_of_week", todayDay);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  const grouped = useMemo(() => DAYS.map((d) => ({
    ...d,
    items: schedules.filter((item: any) => item.day_of_week === d.value),
  })), [schedules]);
  const { data: visitStatus = { visited: [], paid: [] }, isLoading: visitsLoading } = useQuery({
    queryKey: ["schedule-visited-today", ownerId, profile?.userId, todayStart.toISOString().slice(0, 10)],
    enabled: !!ownerId,
    queryFn: async () => {
      let query = supabase.from("transactions").select("outlet_id,amount_paid,visit_date").eq("user_id", ownerId).gte("visit_date", todayStart.toISOString()).lt("visit_date", tomorrowStart.toISOString());
      if (!isOwner && profile?.userId) query = query.eq("sales_user_id", profile.userId);
      const { data, error } = await query;
      if (error) throw error;
      const visited = new Set<string>();
      const paid = new Set<string>();
      for (const row of data ?? []) {
        if (!row.outlet_id) continue;
        visited.add(row.outlet_id);
        if (Number(row.amount_paid) > 0) paid.add(row.outlet_id);
      }
      return { visited: [...visited], paid: [...paid] };
    },
    staleTime: 15_000,
  });

  const visitedOutletIds = useMemo(() => new Set(visitStatus.visited), [visitStatus]);
  const paidOutletIds = useMemo(() => new Set(visitStatus.paid), [visitStatus]);
  const todayOutletIds = useMemo<string[]>(
    () => [...new Set((schedules as any[]).map((item) => item.outlet_id).filter(Boolean))] as string[],
    [schedules]
  );

  type OutletDebt = { outletId: string; amount: number };
  const { data: outstandingDebts = [], isLoading: debtsLoading } = useQuery<OutletDebt[]>({
    queryKey: ["schedule-outlet-debts", ownerId, todayOutletIds.join(",")],
    enabled: !!ownerId && todayOutletIds.length > 0,
    queryFn: async () => {
      const client = supabase as any;
      const { data, error } = await client
        .from("transactions")
        .select("outlet_id,remaining_debt,visit_date,created_at")
        .in("outlet_id", todayOutletIds)
        .eq("user_id", ownerId)
        .order("visit_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;

      const latest = new Map<string, number>();
      for (const row of data ?? []) {
        if (!latest.has(row.outlet_id)) latest.set(row.outlet_id, Number(row.remaining_debt) || 0);
      }
      return [...latest.entries()].map(([outletId, amount]) => ({ outletId, amount })) as OutletDebt[];
    },
    staleTime: 15_000,
  });

  const outstandingByOutlet = useMemo(
    () => new Map<string, number>(outstandingDebts.map((row) => [row.outletId, row.amount])),
    [outstandingDebts]
  );

  const reorderSchedules = async (fromIndex: number, toIndex: number) => {
    if (isOwner || busy || fromIndex === toIndex) return;
    if (fromIndex < 0 || toIndex < 0 || fromIndex >= schedules.length || toIndex >= schedules.length) return;
    const fromItem = schedules[fromIndex] as any;
    const toItem = schedules[toIndex] as any;
    if (fromItem.day_of_week !== todayDay || toItem.day_of_week !== todayDay) {
      toast.error("Jadwal yang dipilih tidak valid untuk diurutkan.");
      return;
    }

    setBusy(true);
    try {
      const step = fromIndex < toIndex ? 1 : -1;
      let currentIndex = fromIndex;
      while (currentIndex !== toIndex) {
        const nextIndex = currentIndex + step;
        const current = schedules[currentIndex] as any;
        const target = schedules[nextIndex] as any;
        const { error } = await (supabase as any).rpc("swap_sales_schedule_order", {
          _first_id: current.id,
          _second_id: target.id,
        });
        if (error) throw error;
        currentIndex = nextIndex;
      }
      await qc.invalidateQueries({ queryKey: ["store-schedules", ownerId, profile?.userId, profile?.role] });
      toast.success("Urutan kunjungan diperbarui");
    } catch (error) {
      toast.error((error as Error).message || "Urutan gagal diperbarui.");
    } finally {
      setBusy(false);
      setDraggingId(null);
      setDragOverId(null);
    }
  };

  useEffect(() => {
    if (!draggingId) return;

    const handlePointerMove = (event: PointerEvent) => {
      if (dragPointerId.current !== null && event.pointerId !== dragPointerId.current) return;
      event.preventDefault();

      const target = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
      const card = target?.closest("[data-schedule-id]") as HTMLElement | null;
      const id = card?.dataset.scheduleId;
      if (!id || id === draggingId) return;

      const over = schedules.find((item: any) => item.id === id) as any;
      if (over?.day_of_week === todayDay) {
        dragOverRef.current = id;
        setDragOverId(id);
      }
    };

    const finishDrag = () => {
      const currentDraggingId = dragCandidateId.current;
      const currentOverId = dragOverRef.current;
      dragPointerId.current = null;
      dragCandidateId.current = null;
      dragOverRef.current = null;

      if (!currentDraggingId) {
        setDraggingId(null);
        setDragOverId(null);
        return;
      }

      const fromIndex = schedules.findIndex((item: any) => item.id === currentDraggingId);
      const toIndex = currentOverId ? schedules.findIndex((item: any) => item.id === currentOverId) : fromIndex;

      setDragOverId(null);

      if (fromIndex >= 0 && toIndex >= 0 && fromIndex !== toIndex) {
        void reorderSchedules(fromIndex, toIndex);
      } else {
        setDraggingId(null);
      }
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", finishDrag);
    window.addEventListener("pointercancel", finishDrag);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishDrag);
      window.removeEventListener("pointercancel", finishDrag);
    };
  }, [draggingId, schedules, todayDay]);

  async function addSchedule(e: FormEvent) {
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
        {!isOwner && !schedulesLoading && schedules.length > 0 && (
          <div className="rounded-xl border bg-primary/5 p-3 text-sm">
            <div className="font-semibold">Jadwal Hari Ini · {DAYS.find((d) => d.value === todayDay)?.label}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {schedules.length} outlet dijadwalkan untuk dikunjungi
              {!visitsLoading && ` · ${schedules.filter((item: any) => paidOutletIds.has(item.outlet_id)).length} sudah tertagih`}
            </div>
          </div>
        )}

        {isOwner ? (
          grouped.map((d) => d.items.length > 0 && (
            <div key={d.value}>
              <h2 className="mb-2 font-semibold">{d.label}</h2>
              <div className="space-y-2">
                {d.items.map((item: any) => (
                  <div key={item.id} className="rounded-xl border bg-card p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="font-semibold">{item.outlets?.name ?? "Toko"}</div>
                          {item.day_of_week === todayDay && visitedOutletIds.has(item.outlet_id) && (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                              <CheckCircle2 className="h-3 w-3" /> {paidOutletIds.has(item.outlet_id) ? "Sudah tertagih" : "Sudah dikunjungi"}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">PIC: {item.profiles?.display_name ?? item.profiles?.username ?? item.profiles?.user_email ?? "Sales"}</div>
                        {item.note && <div className="mt-1 text-xs text-muted-foreground">{item.note}</div>}
                      </div>
                      <Button variant="ghost" size="icon" aria-label="Hapus jadwal" onClick={() => removeSchedule(item.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div>
            <h2 className="mb-2 flex items-center gap-2 font-semibold">
              Urutan Tagihan Hari Ini
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                {DAYS.find((d) => d.value === todayDay)?.label}
              </span>
            </h2>
            <p className="mb-3 text-xs text-muted-foreground">Tekan lalu geser kartu toko untuk mengatur urutan tagihan.</p>
            <div className="space-y-2">
              {schedules.map((item: any, index: number) => (
                <div
                  key={item.id}
                  data-schedule-id={item.id}
                  onPointerDown={(event) => {
                    if (busy || isOwner) return;
                    dragPointerId.current = event.pointerId;
                    dragCandidateId.current = item.id;
                    dragStartPoint.current = { x: event.clientX, y: event.clientY };
                  }}
                  onPointerMove={(event) => {
                    if (busy || dragCandidateId.current !== item.id || dragPointerId.current !== event.pointerId) return;
                    const dx = event.clientX - dragStartPoint.current.x;
                    const dy = event.clientY - dragStartPoint.current.y;
                    if (!draggingId && Math.hypot(dx, dy) > 8) {
                      setDraggingId(item.id);
                      dragOverRef.current = item.id;
                      setDragOverId(item.id);
                    }
                  }}
                  className={`rounded-xl border bg-card p-3 transition-all ${draggingId === item.id ? "touch-none scale-[0.99] opacity-60" : ""} ${dragOverId === item.id ? "border-primary ring-2 ring-primary/20" : ""}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          aria-label="Geser untuk mengatur urutan"
                          title="Tekan dan geser untuk mengatur urutan"
                          disabled={busy}
                          onPointerDown={(event) => {
                            if (busy) return;
                            dragPointerId.current = event.pointerId;
                            dragCandidateId.current = item.id;
                            dragStartPoint.current = { x: event.clientX, y: event.clientY };
                          }}
                          className="flex h-8 w-8 shrink-0 touch-none items-center justify-center rounded-lg bg-primary/10 text-primary active:bg-primary/20"
                        >
                          <GripVertical className="h-4 w-4" />
                        </button>
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{index + 1}</span>
                        <div className="font-semibold">{item.outlets?.name ?? "Toko"}</div>
                        {visitedOutletIds.has(item.outlet_id) && (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 className="h-3 w-3" /> Sudah tertagih
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-sm font-semibold">
                        {debtsLoading ? "Memuat tagihan..." : `Tagihan: Rp ${Math.round(outstandingByOutlet.get(item.outlet_id) ?? 0).toLocaleString("id-ID")}`}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">PIC: {item.profiles?.display_name ?? item.profiles?.username ?? item.profiles?.user_email ?? "Sales"}</div>
                      {item.note && <div className="mt-1 text-xs text-muted-foreground">{item.note}</div>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
