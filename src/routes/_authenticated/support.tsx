import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, MessageCircle, Search, Send, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/support")({ head: () => ({ meta: [{ title: "Support — Sales Pouch" }] }), component: SupportPage });
const db = supabase as any;
const fmt = (d: string) => new Date(d).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
type C = { id: string; user_id: string; status: "open" | "closed"; created_at: string; updated_at: string };
type M = { id: string; conversation_id: string; sender_id: string; message: string; created_at: string; read_at: string | null };
type P = { id: string; business_name: string | null; user_email: string | null; created_at: string };

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
  const qc = useQueryClient(); const [selected, setSelected] = useState<string | null>(null); const [text, setText] = useState(""); const [search, setSearch] = useState("");
  const { data: auth } = useQuery({ queryKey: ["support-admin-auth"], queryFn: async () => (await supabase.auth.getUser()).data.user }); const adminId = auth?.id;
  const { data: profiles } = useQuery({ queryKey: ["support-admin-users"], queryFn: async () => { const { data, error } = await db.from("profiles").select("id,business_name,user_email,created_at").order("created_at", { ascending: false }); if (error) throw error; return (data ?? []) as P[]; } });
  const { data: conversations } = useQuery({ queryKey: ["support-admin-conversations"], queryFn: async () => { const { data, error } = await db.from("support_conversations").select("*").order("updated_at", { ascending: false }); if (error) throw error; return (data ?? []) as C[]; } });
  const { data: allMessages } = useQuery({ queryKey: ["support-admin-all-messages"], queryFn: async () => { const { data, error } = await db.from("support_messages").select("id,conversation_id,sender_id,read_at"); if (error) throw error; return (data ?? []) as Pick<M, "id" | "conversation_id" | "sender_id" | "read_at">[]; } });
  const unreadByConversation = useMemo(() => { const map: Record<string, number> = {}; for (const m of allMessages ?? []) if (m.sender_id !== adminId && !m.read_at) map[m.conversation_id] = (map[m.conversation_id] ?? 0) + 1; return map; }, [allMessages, adminId]);
  const filteredProfiles = (profiles ?? []).filter((p) => `${p.business_name ?? ""} ${p.user_email ?? ""}`.toLowerCase().includes(search.trim().toLowerCase()));
  const active = conversations?.find((c) => c.id === selected) ?? conversations?.[0];
  const activeProfile = profiles?.find((p) => p.id === active?.user_id);
  const { data: messages } = useQuery({ queryKey: ["support-admin-messages", active?.id], enabled: !!active, queryFn: async () => { const { data, error } = await db.from("support_messages").select("*").eq("conversation_id", active.id).order("created_at"); if (error) throw error; return (data ?? []) as M[]; } });

  useEffect(() => { const ch = supabase.channel("support-admin").on("postgres_changes", { event: "*", schema: "public", table: "support_conversations" }, () => { qc.invalidateQueries({ queryKey: ["support-admin-conversations"] }); qc.invalidateQueries({ queryKey: ["support-admin-users"] }); }).on("postgres_changes", { event: "*", schema: "public", table: "support_messages" }, (payload) => { if (payload.eventType === "INSERT" && payload.new && (payload.new as M).sender_id !== adminId) toast.info("Pesan baru dari pengguna"); qc.invalidateQueries({ queryKey: ["support-admin-conversations"] }); qc.invalidateQueries({ queryKey: ["support-admin-all-messages"] }); if (active) qc.invalidateQueries({ queryKey: ["support-admin-messages", active.id] }); }).subscribe(); return () => { supabase.removeChannel(ch); }; }, [qc, active?.id, adminId]);
  useEffect(() => { if (!active || !adminId || !messages?.length) return; const unread = messages.filter((m) => m.sender_id !== adminId && !m.read_at).map((m) => m.id); if (!unread.length) return; void db.from("support_messages").update({ read_at: new Date().toISOString() }).in("id", unread).then(() => qc.invalidateQueries({ queryKey: ["support-admin-all-messages"] })); }, [active?.id, adminId, messages, qc]);

  async function openUser(userId: string) {
    let conversation = conversations?.find((c) => c.user_id === userId);
    if (!conversation) {
      const r = await db.from("support_conversations").insert({ user_id: userId, status: "open" }).select("*").single();
      if (r.error) { toast.error(r.error.message); return; }
      conversation = r.data as C;
      qc.invalidateQueries({ queryKey: ["support-admin-conversations"] });
    }
    setSelected(conversation.id); setText("");
  }

  async function send() { const message = text.trim(); if (!message || !adminId || !active) return; const r = await db.from("support_messages").insert({ conversation_id: active.id, sender_id: adminId, message }); if (r.error) { toast.error(r.error.message); return; } await db.from("support_conversations").update({ updated_at: new Date().toISOString(), status: "open" }).eq("id", active.id); setText(""); qc.invalidateQueries({ queryKey: ["support-admin-messages", active.id] }); }

  return <main className="mx-auto min-h-screen max-w-5xl px-5 pb-10 pt-6"><Link to="/admin" className="flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" />Super Admin</Link><div className="mt-3"><h1 className="text-2xl font-bold">Support</h1><p className="text-sm text-muted-foreground">Chat dengan user terdaftar atau balas pesan yang masuk.</p></div><div className="mt-5 grid min-h-[70vh] gap-3 md:grid-cols-[300px_1fr]"><section className="rounded-2xl border bg-card p-2"><div className="px-3 py-2 text-sm font-semibold">User Terdaftar ({profiles?.length ?? 0})</div><div className="relative px-2 pb-2"><Search className="absolute left-4 top-3 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari user / usaha…" className="h-10 pl-9" /></div><div className="max-h-[58vh] space-y-1 overflow-y-auto">{filteredProfiles.map((p) => { const c = conversations?.find((x) => x.user_id === p.id); const unread = c ? unreadByConversation[c.id] ?? 0 : 0; return <button key={p.id} onClick={() => void openUser(p.id)} className={`w-full rounded-xl p-3 text-left ${activeProfile?.id === p.id ? "bg-primary/10" : "hover:bg-muted"}`}><div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-semibold">{p.business_name || "Tanpa nama usaha"}</span>{unread > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">{unread}</span>}</div><div className="truncate text-[11px] text-muted-foreground">{p.user_email || p.id}</div><div className="text-[10px] text-muted-foreground">{c ? fmt(c.updated_at) : "Belum pernah chat"}</div></button>; })}</div></section>{active ? <ChatShell title={activeProfile?.business_name || "User"} subtitle={activeProfile?.user_email || `User ${active.user_id}`} back="/admin" messages={messages} ownId={adminId} text={text} setText={setText} send={send} admin /> : <section className="flex items-center justify-center rounded-2xl border bg-card text-sm text-muted-foreground">Pilih user untuk memulai chat.</section>}</div></main>;
}

function ChatShell({ title, subtitle, back, messages, ownId, text, setText, send, admin }: { title: string; subtitle: string; back: "/dashboard" | "/admin"; messages?: M[]; ownId?: string; text: string; setText: (v: string) => void; send: () => Promise<void>; admin: boolean }) {
  return <main className="mx-auto flex min-h-screen max-w-2xl flex-col px-5 pb-6 pt-6"><Link to={back} className="flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" /><span>Kembali</span></Link><div className="mt-4 flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">{admin ? <ShieldCheck className="h-6 w-6 text-primary" /> : <MessageCircle className="h-6 w-6 text-primary" />}</div><div><h1 className="text-2xl font-bold">{title}</h1><p className="text-sm text-muted-foreground">{subtitle}</p></div></div><section className="mt-5 flex min-h-[55vh] flex-1 flex-col rounded-2xl border bg-card"><div className="border-b px-4 py-3 text-sm font-semibold">{admin ? "Pesan untuk user" : "Chat dengan Admin"}</div><div className="flex-1 space-y-3 overflow-y-auto p-4">{!messages?.length && <div className="py-16 text-center text-sm text-muted-foreground">Belum ada pesan.</div>}{messages?.map((m) => <div key={m.id} className={`flex ${m.sender_id === ownId ? "justify-end" : "justify-start"}`}><div className={`max-w-[82%] rounded-2xl px-3 py-2 text-sm ${m.sender_id === ownId ? "bg-primary text-primary-foreground" : "bg-muted"}`}><div className="whitespace-pre-wrap break-words">{m.message}</div><div className="mt-1 text-[10px] opacity-70">{fmt(m.created_at)}</div></div></div>)}</div><div className="border-t p-3"><Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={admin ? "Tulis pesan ke user…" : "Tulis pesan…"} maxLength={4000} className="min-h-20 resize-none" onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} /><div className="mt-2 flex justify-end"><Button onClick={() => void send()} disabled={!text.trim()}><Send className="mr-2 h-4 w-4" />Kirim</Button></div></div></section></main>;
}
