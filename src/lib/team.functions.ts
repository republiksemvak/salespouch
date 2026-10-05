import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isSuperAdminEmail } from "@/lib/access";
import { salesAuthEmail, normalizeSalesUsername } from "@/lib/sales-auth";
import { levelDefaults } from "@/lib/team-permissions";

type TeamPosition = "admin" | "manager" | "sales";
type TeamActor = { ownerId: string; position: "owner" | TeamPosition };

async function getTeamActor(context: { supabase: any; userId: string }): Promise<TeamActor> {
  const { data: authUser, error: authError } = await context.supabase.auth.getUser();
  if (!authError && authUser.user && authUser.user.id === context.userId && isSuperAdminEmail(authUser.user.email)) return { ownerId: context.userId, position: "owner" };
  const { data: member, error: memberError } = await context.supabase.from("team_members").select("owner_id,position").eq("user_id", context.userId).maybeSingle();
  if (memberError) throw memberError;
  if (member) return { ownerId: member.owner_id, position: member.position as TeamPosition };
  const { data: profile, error: profileError } = await context.supabase.from("profiles").select("id").eq("id", context.userId).maybeSingle();
  if (profileError) throw profileError;
  if (profile) return { ownerId: context.userId, position: "owner" };
  throw new Error("Hanya Owner, Admin, Manager, atau Sales yang dapat mengelola tim.");
}

async function assertOwner(context: { supabase: any; userId: string }) {
  const actor = await getTeamActor(context);
  if (actor.position !== "owner") throw new Error("Hanya Owner yang dapat melakukan tindakan ini.");
  return actor;
}

async function assertTeamManager(context: { supabase: any; userId: string }) {
  const actor = await getTeamActor(context);
  if (actor.position !== "owner" && actor.position !== "manager") throw new Error("Hanya Owner atau Manager yang dapat mengelola struktur tim.");
  return actor;
}

async function assertTeamPermission(context: { supabase: any; userId: string }, permissionKey: string) {
  const actor = await getTeamActor(context);
  if (actor.position === "owner") return actor;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("team_permissions")
    .select("id")
    .eq("owner_id", actor.ownerId)
    .eq("user_id", context.userId)
    .eq("permission_key", permissionKey)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`Akses ${permissionKey} tidak diberikan oleh Owner.`);
  return actor;
}

export const getMyTeamPermissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({}).parse(input ?? {}))
  .handler(async ({ context }) => {
    const actor = await getTeamActor(context);
    if (actor.position === "owner") return { role: "owner" as const, permissions: [] as string[] };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.from("team_permissions").select("permission_key").eq("owner_id", actor.ownerId).eq("user_id", context.userId);
    if (error) throw error;
    return { role: actor.position, permissions: (data ?? []).map((item) => item.permission_key) };
  });

export const getOwnerProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const actor = await assertOwner(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.from("products").select("id,name,price,price_grosir,price_agen,cost_price,warehouse_stock,pcs_per_pack").eq("user_id", actor.ownerId).order("name");
    if (error) throw error;
    return data;
  });

export const listTeam = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({}).parse(input ?? {}))
  .handler(async ({ context }) => {
    const actor = await assertTeamPermission(context, "team");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: members, error } = await supabaseAdmin.from("team_members").select("user_id,owner_id,position,manager_id,created_at").eq("owner_id", actor.ownerId).order("created_at", { ascending: false });
    if (error) throw error;
    if (!members?.length) return [];
    const ids = [...new Set(members.flatMap((member) => [member.user_id, member.manager_id].filter((id): id is string => typeof id === "string")))];
    const { data: profiles, error: profilesError } = await supabaseAdmin.from("profiles").select("id,user_email,username,display_name").in("id", ids);
    if (profilesError) throw profilesError;
    const { data: permissions, error: permissionsError } = await supabaseAdmin.from("team_permissions").select("user_id,permission_key").eq("owner_id", actor.ownerId).in("user_id", members.map((member) => member.user_id));
    if (permissionsError) throw permissionsError;
    const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
    const permissionMap = new Map<string, string[]>();
    for (const permission of permissions ?? []) permissionMap.set(permission.user_id, [...(permissionMap.get(permission.user_id) ?? []), permission.permission_key]);
    return members.map((member) => ({ ...member, profiles: profileMap.get(member.user_id) ?? null, manager: member.manager_id ? profileMap.get(member.manager_id) ?? null : null, permissions: permissionMap.get(member.user_id) ?? levelDefaults[member.position as TeamPosition] ?? [] }));
  });

export const setTeamMemberAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ userId: z.string().uuid(), position: z.enum(["admin", "manager", "sales"]), permissionKeys: z.array(z.string().trim().min(1)).max(100) }).parse(input))
  .handler(async ({ context, data }) => {
    await assertOwner(context);
    const { error } = await context.supabase.rpc("set_team_member_access", {
      _user_id: data.userId,
      _position: data.position,
      _permission_keys: data.permissionKeys,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setTeamMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ userId: z.string().uuid(), position: z.enum(["admin", "manager", "sales"]) }).parse(input))
  .handler(async ({ context, data }) => {
    const actor = await assertOwner(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: target, error: targetError } = await supabaseAdmin
      .from("team_members")
      .select("user_id,owner_id,position")
      .eq("user_id", data.userId)
      .eq("owner_id", actor.ownerId)
      .maybeSingle();
    if (targetError) throw targetError;
    if (!target) throw new Error("Anggota tim tidak ditemukan di bisnis Owner ini.");

    const { error } = await supabaseAdmin
      .from("team_members")
      .update({
        position: data.position,
        manager_id: data.position === "sales" ? undefined : null,
      })
      .eq("user_id", data.userId)
      .eq("owner_id", actor.ownerId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const replaceTeamPermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ userId: z.string().uuid(), permissionKeys: z.array(z.string().trim().min(1)).max(100) }).parse(input))
  .handler(async ({ context, data }) => {
    const actor = await assertOwner(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: target, error: targetError } = await supabaseAdmin
      .from("team_members")
      .select("user_id,owner_id")
      .eq("user_id", data.userId)
      .eq("owner_id", actor.ownerId)
      .maybeSingle();
    if (targetError) throw targetError;
    if (!target) throw new Error("Anggota tim tidak ditemukan di bisnis Owner ini.");

    const { error: deleteError } = await supabaseAdmin
      .from("team_permissions")
      .delete()
      .eq("owner_id", actor.ownerId)
      .eq("user_id", data.userId);
    if (deleteError) throw deleteError;

    if (data.permissionKeys.length) {
      const rows = data.permissionKeys.map((permission_key) => ({
        owner_id: actor.ownerId,
        user_id: data.userId,
        permission_key,
      }));
      const { error: insertError } = await supabaseAdmin
        .from("team_permissions")
        .insert(rows);
      if (insertError) throw insertError;
    }

    return { ok: true };
  });

export const createSales = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ name: z.string().trim().min(1, "Nama karyawan wajib diisi.").max(100), username: z.string().trim().min(3).max(30).regex(/^[a-zA-Z0-9._-]+$/, "Username hanya boleh berisi huruf, angka, titik, garis bawah, atau tanda minus."), password: z.string().min(6, "Password minimal 6 karakter.").max(72), position: z.enum(["admin", "manager", "sales"]).default("sales"), managerId: z.string().uuid().nullable().optional() }).parse(input))
  .handler(async ({ context, data }) => {
    const actor = await getTeamActor(context);
    if (actor.position !== "owner" && actor.position !== "manager") throw new Error("Admin tidak memiliki kewenangan membuat struktur jabatan. Gunakan Owner untuk membuat Admin/Manager, atau Manager untuk membuat Sales.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const position: TeamPosition = actor.position === "manager" ? "sales" : data.position;
    const managerId = actor.position === "manager" ? context.userId : (data.managerId ?? null);
    if (position !== "sales" && managerId) throw new Error("Admin dan Manager tidak dapat ditempatkan di bawah Manager.");
    if (position === "sales" && managerId) {
      const { data: manager, error: managerError } = await supabaseAdmin.from("team_members").select("user_id,owner_id,position").eq("user_id", managerId).eq("owner_id", actor.ownerId).maybeSingle();
      if (managerError) throw managerError;
      if (!manager || manager.position !== "manager") throw new Error("Manager yang dipilih tidak valid.");
    }
    const username = normalizeSalesUsername(data.username);
    const name = data.name.trim();
    const { data: existing, error: lookupError } = await supabaseAdmin.from("profiles").select("id").eq("username", username).maybeSingle();
    if (lookupError) throw lookupError;
    if (existing) throw new Error("Username sudah digunakan. Pilih username lain.");
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({ email: salesAuthEmail(username), password: data.password, email_confirm: true, user_metadata: { username, display_name: name, role: "sales", team_position: position } });
    if (createError || !created.user) throw new Error(createError?.message ?? "Akun karyawan gagal dibuat.");
    try {
      const { data: savedProfile, error: profileError } = await supabaseAdmin.from("profiles").update({ username, display_name: name }).eq("id", created.user.id).select("id,username,display_name").single();
      if (profileError) throw profileError;
      if (savedProfile?.username !== username || savedProfile.display_name !== name) throw new Error("Profil karyawan gagal disimpan.");
      const { error: linkError } = await (supabaseAdmin as any).from("team_members").insert({ owner_id: actor.ownerId, user_id: created.user.id, position, manager_id: managerId });
      if (linkError) throw linkError;
    } catch (error) {
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      if ((error as { code?: string }).code === "23505") throw new Error("Username sudah digunakan. Pilih username lain.");
      throw new Error((error as Error).message ?? "Akun karyawan gagal dihubungkan ke tim.");
    }
    return { ok: true, username, name, position, managerId };
  });

export const removeSales = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const actor = await assertTeamManager(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: target, error: targetError } = await supabaseAdmin.from("team_members").select("user_id,owner_id,position,manager_id").eq("user_id", data.userId).eq("owner_id", actor.ownerId).maybeSingle();
    if (targetError) throw targetError;
    if (!target) throw new Error("Anggota tim tidak ditemukan.");
    if (actor.position === "manager" && (target.position !== "sales" || target.manager_id !== context.userId)) throw new Error("Manager hanya dapat mengeluarkan Sales di bawahnya.");
    const { error } = await supabaseAdmin.from("team_members").delete().eq("owner_id", actor.ownerId).eq("user_id", data.userId);
    if (error) throw error;
    return { ok: true };
  });
