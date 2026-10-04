import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isSuperAdminEmail } from "@/lib/access";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.auth.getUser();
  if (error || !data.user || data.user.id !== ctx.userId || !isSuperAdminEmail(data.user.email)) {
    throw new Error("Hanya super admin");
  }
}

export const getAdminUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: profiles, error: profileError }, { data: members, error: memberError }, { data: adminRoles, error: roleError }] = await Promise.all([
      supabaseAdmin.from("profiles").select("*").order("created_at", { ascending: false }),
      supabaseAdmin.from("team_members").select("user_id,owner_id"),
      supabaseAdmin.from("user_roles").select("user_id").eq("role", "admin"),
    ]);
    if (profileError) throw new Error(profileError.message);
    if (memberError) throw new Error(memberError.message);
    if (roleError) throw new Error(roleError.message);
    const salesIds = new Set((members ?? []).map((m: { user_id: string }) => m.user_id));
    const adminIds = new Set((adminRoles ?? []).map((r: { user_id: string }) => r.user_id));
    const owners = (profiles ?? []).filter((p: { id: string; role?: string; user_email?: string | null }) => {
      const email = (p.user_email ?? "").trim().toLowerCase();
      const isSalesAccount = salesIds.has(p.id) || p.role === "sales" || email.endsWith("@salespouch.local");
      return !isSalesAccount && !adminIds.has(p.id);
    });
    const salesCountByOwner: Record<string, number> = {};
    for (const member of members ?? []) salesCountByOwner[member.owner_id] = (salesCountByOwner[member.owner_id] ?? 0) + 1;
    return { owners, salesCountByOwner };
  });

async function resolveAuthUserId(supabaseAdmin: any, profileUserId: string) {
  const { data: profile, error: profileError } = await supabaseAdmin.from("profiles").select("id,user_email").eq("id", profileUserId).maybeSingle();
  if (profileError) throw new Error(profileError.message);
  if (!profile) throw new Error("Profil user tidak ditemukan.");
  const { data: direct, error: directError } = await supabaseAdmin.auth.admin.getUserById(profileUserId);
  if (!directError && direct.user) return { authUserId: direct.user.id, profile };
  if (profile.user_email) {
    const { data: listed, error: listError } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (!listError) {
      const match = listed.users.find((u: { email?: string }) => u.email?.toLowerCase() === profile.user_email?.toLowerCase());
      if (match) return { authUserId: match.id, profile };
    }
  }
  return { authUserId: null, profile };
}

export const setUserLicense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid(), mode: z.enum(["add", "set", "revoke"]), days: z.number().int().min(0).max(3650).optional(), until: z.string().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prof, error: e1 } = await supabaseAdmin.from("profiles").select("license_until").eq("id", data.userId).single();
    if (e1) throw new Error(e1.message);
    let until: string | null = null;
    if (data.mode === "add") {
      const base = prof.license_until && new Date(prof.license_until).getTime() > Date.now() ? new Date(prof.license_until) : new Date();
      until = new Date(base.getTime() + (data.days ?? 0) * 86400000).toISOString();
    } else if (data.mode === "set") {
      if (!data.until) throw new Error("Tanggal wajib");
      until = new Date(data.until).toISOString();
    }
    const { error } = await supabaseAdmin.from("profiles").update({ license_until: until }).eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { license_until: until };
  });

export const resetUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid(), password: z.string().min(6, "Password minimal 6 karakter").max(72) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.userId === context.userId) throw new Error("Gunakan Profil Usaha untuk mengubah password akun admin.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: role } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", data.userId).eq("role", "admin").maybeSingle();
    if (role) throw new Error("Password akun super admin tidak dapat diubah dari sini.");
    const { authUserId } = await resolveAuthUserId(supabaseAdmin, data.userId);
    if (!authUserId) throw new Error("Akun Auth user tidak ditemukan. User ini perlu dibersihkan dari data lama.");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(authUserId, { password: data.password });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.userId === context.userId) throw new Error("Super admin tidak dapat menghapus akunnya sendiri.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: role } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", data.userId).eq("role", "admin").maybeSingle();
    if (role) throw new Error("Akun super admin tidak dapat dihapus dari sini.");
    const { authUserId } = await resolveAuthUserId(supabaseAdmin, data.userId);
    if (authUserId) {
      const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(authUserId);
      if (authError) throw new Error(authError.message);
    }
    const { error: profileError } = await supabaseAdmin.from("profiles").delete().eq("id", data.userId);
    if (profileError) throw new Error(profileError.message);
    return { ok: true, orphanedAuth: !authUserId };
  });

export const resetStockOpening = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ ownerId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: setup, error: setupError } = await supabaseAdmin.from("stock_setups").select("id,owner_id").eq("owner_id", data.ownerId).maybeSingle();
    if (setupError) throw new Error(setupError.message);
    if (!setup) return { ok: true, reset: false };
    const { error } = await supabaseAdmin.from("stock_setups").delete().eq("id", setup.id).eq("owner_id", data.ownerId);
    if (error) throw new Error(error.message);
    return { ok: true, reset: true };
  });
