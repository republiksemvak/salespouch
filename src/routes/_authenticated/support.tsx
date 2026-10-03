import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, MessageCircle, Send, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/support")({ head: () => ({ meta: [{ title: "Support — Sales Pouch" }] }), component: SupportPage });
const db = supabase as any;
const fmt = (d: string) => new Date(d).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
type C = { id: string; user_id: string; status: "open" | "closed"; created_at: string; updated_at: string };
type M = { id: string; conversation_id: string; sender_id: string; message: string; created_at: string; read_at: string | null };

function SupportPage() {
  const { data: admin, isLoading } = useIsAdmin();
  if (isLoading) return <main className="p-6 text-center text-muted-foreground">Memuat…</main>;
  return admin ? <AdminSupport /> : <UserSupport />;
}

function UserSupport() {
  const qc = useQueryClient(); const [text, setText] = useState("");
  const { data: auth } = useQuery({ queryKey: ["support-auth"], queryFn: async () => (await supabase.auth.getUser()).data.user });
  const uid = auth?.id;
  const { data: conversation } = useQuery({ queryKey: ["support-conversation", uid], enabled: !!uid, queryFn: async () => { const { data, error } = await db.from("support_conversations").select("*").eq("user_id", uid).maybeSingle(); if (error) throw error; return data as C | null; } });
  const cid = conversation?.id;
  const { data: messages } = useQuery({ queryKey: ["support-messages", cid], enabled: !!cid, queryFn: async () => { const { data, error } = await db.from("support_messages").select("*").eq("conversation_id", cid).order("created_at"); if (error) throw error; return (data ?? []) as M[]; } });
  useEffect(() => {
    if (!cid) return;
    const ch = supabase.channel(`support-${cid}`).on("postgres_changes", { event: "*", schema: "public", table: "support_messages", filter: `conversation_id=eq.${cid}` }, (payload) => {
      if (payload.eventType === "INSERT" && payload.new && (payload.new as M).sender_id !== uid) toast.info("Pesan baru dari Admin");
      qc.invalidateQueries({ queryKey: ["support-messages", cid] });
      qc.invalidateQueries({ queryKey: ["support-unread", uid] });
    }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [cid, qc, uid]);
  useEffect(() => {
    if (!uid || !messages?.length) return;
    const unread = messages.filter((m) => m.sender_id !== uid && !m.read_at).map((m) => m.id);
    if (!unread.length) return;
    void db.from("support_messages").update({ read_at: new Date().toISOString() }).in("id", unread);
    qc.invalidateQueries({ queryKey: ["support-unread", uid] });
  }, [messages, uid, qc]);
  async function send() { const message = text.trim(); if (!message || !uid) return; try { let id = cid; if (!id) { const r = await db.from("support_conversations").insert({ user_id: uid }).select("*").single(); if (r.error) throw r.error; id = r.data.id; qc.setQueryData(["support-conversation", uid], r.data); } const r = await db.from("support_messages").insert({ conversation_id: id, sender_id: uid, message }); if (r.error) throw r.error; await db.from("support_conversations").update({ updated_at: new Date().toISOString(), status: "open" }).eq("id", id); setText(""); qc.invalidateQueries({ queryKey: ["support-messages", id] }); } catch (e) { toast.error((e as Error).message); } }
  return <ChatShell title="Support" subtitle="Chat langsung dengan Admin Sales Pouch." back="/dashboard" messages={messages} ownId={uid} text={text} setText={setText} send={send} admin={false} />;
}

function AdminSupport() {
  const qc = useQueryClient(); const [selected, setSelected] = useState<string | null>(null); const [text, setText] = useState("");
  const { data: auth } = useQuery({ queryKey: ["support-admin-auth"], queryFn: async () => (await supabase.auth.getUser()).data.user }); const adminId = auth?.id;
  const { data: conversations } = useQuery({ queryKey: ["support-admin-conversations"], queryFn: async () => { const { data, error } = await db.from("support_conversations").select("*").order("updated_at", { ascending: false }); if (error) throw error; return (data ?? []) as C[]; } });
  const active = conversations?.find((c) => c.id === selected) ?? conversations?.[0];
  const { data: messages } = useQuery({ queryKey: ["support-admin-messages", active?.id], enabled: !!active, queryFn: async () => { const { data, error } = await db.from("support_messages").select("*").eq("conversation_id", active.id).order("created_at"); if (error) throw error; return (data ?? []) as M[]; } });
  useEffect(() => { const ch = supabase.channel("support-admin").on("postgres_changes", { event: "*", schema: "public", table: "support_conversations" }, () => qc.invalidateQueries({ queryKey: ["support-admin-conversations"] })).on("postgres_changes", { event: "*", schema: "public", table: "support_messages" }, (payload) => { if (payload.eventType === "INSERT" && payload.new && (payload.new as M).sender_id !== adminId) toast.info("Pesan baru dari pengguna"); qc.invalidateQueries({ queryKey: ["support-admin-conversations"] }); if (active) qc.invalidateQueries({ queryKey: ["support-admin-messages", active.id] }); }).subscribe(); return () => { supabase.removeChannel(ch); }; }, [qc, active?.id, adminId]);
  useEffect(() => {
    if (!active || !adminId || !messages?.length) return;
    const unread = messages.filter((m) => m.sender_id !== adminId && !m.read_at).map((m) => m.id);
    if (!unread.length) return;
    void db.from("support_messages").update({ read_at: new Date().toISOString() }).in("id", unread);
    qc.invalidateQueries({ queryKey: ["support-unread", adminId] });
  }, [active?.id, adminId, messages, qc]);
  async function send() { const message = text.trim(); if (!message || !adminId || !active) return; const r = await db.from("support_messages").insert({ conversation_id: active.id, sender_id: adminId, message }); if (r.error) { toast.error(r.error.message); return; } await db.from("support_conversations").update({ updated_at: new Date().toISOString() }).eq("id", active.id); setText(""); qc.invalidateQueries({ queryKey: ["support-admin-messages", active.id] }); }
  return <main className="mx-auto min-h-screen max-w-5xl px-5 pb-10 pt-6"><Link to="/admin" className="flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" />Super Admin</Link><h1 className="mt-3 text-2xl font-bold">Support</h1><div className="mt-5 grid min-h-[70vh] gap-3 md:grid-cols-[280px_1fr]"><section className="rounded-2xl border bg-card p-2"><div className="px-3 py-2 text-sm font-semibold">Percakapan ({conversations?.length ?? 0})</div>{conversations?.map((c) => <button key={c.id} onClick={() => setSelected(c.id)} className={`w-full rounded-xl p-3 text-left ${active?.id === c.id ? "bg-primary/10" : "hover:bg-muted"}`}><div className="truncate text-sm font-semibold">Pengguna</div><div className="truncate text-[11px] text-muted-foreground">{c.user_id}</div><div className="text-[10px] text-muted-foreground">{fmt(c.updated_at)}</div></button>)}</section>{active ? <ChatShell title="Chat Support" subtitle={`User ${active.user_id}`} back="/admin" messages={messages} ownId={adminId} text={text} setText={setText} send={send} admin /> : <section className="flex items-center justify-center rounded-2xl border bg-card text-sm text-muted-foreground">Belum ada percakapan.</section>}</div></main>;
}

function ChatShell({ title, subtitle, back, messages, ownId, text, setText, send, admin }: { title: string; subtitle: string; back: "/dashboard" | "/admin"; messages?: M[]; ownId?: string; text: string; setText: (v: string) => void; send: () => Promise<void>; admin: boolean }) {
  return <main className="mx-auto flex min-h-screen max-w-2xl flex-col px-5 pb-6 pt-6"><Link to={back} className="flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" />Kembali</Link><div className="mt-4 flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">{admin ? <ShieldCheck className="h-6 w-6 text-primary" /> : <MessageCircle className="h-6 w-6 text-primary" />}</div><div><h1 className="text-2xl font-bold">{title}</h1><p className="text-sm text-muted-foreground">{subtitle}</p></div></div><section className="mt-5 flex min-h-[55vh] flex-1 flex-col rounded-2xl border bg-card"><div className="border-b px-4 py-3 text-sm font-semibold">{admin ? "Balas pengguna" : "Chat dengan Admin"}</div><div className="flex-1 space-y-3 overflow-y-auto p-4">{!messages?.length && <div className="py-16 text-center text-sm text-muted-foreground">Belum ada pesan.</div>}{messages?.map((m) => <div key={m.id} className={`flex ${m.sender_id === ownId ? "justify-end" : "justify-start"}`}><div className={`max-w-[82%] rounded-2xl px-3 py-2 text-sm ${m.sender_id === ownId ? "bg-primary text-primary-foreground" : "bg-muted"}`}><div className="whitespace-pre-wrap break-words">{m.message}</div><div className="mt-1 text-[10px] opacity-70">{fmt(m.created_at)}</div></div></div>)}</div><div className="border-t p-3"><Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={admin ? "Balas pesan…" : "Tulis pesan…"} maxLength={4000} className="min-h-20 resize-none" onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} /><div className="mt-2 flex justify-end"><Button onClick={() => void send()} disabled={!text.trim()}><Send className="mr-2 h-4 w-4" />{admin ? "Balas" : "Kirim"}</Button></div></div></section></main>;
}
