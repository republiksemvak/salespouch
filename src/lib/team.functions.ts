import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isSuperAdminEmail } from "@/lib/access";
import { salesAuthEmail, normalizeSalesUsername } from "@/lib/sales-auth";

async function assertOwner(context: { supabase: any; userId: string }) {
  const { data: authUser, error: authError } = await context.supabase.auth.getUser();
  if (!authError && authUser.user && authUser.user.id === context.userId && isSuperAdminEmail(authUser.user.email)) return;

  const { data, error } = await context.supabase.from("team_members").select("user_id").eq("user_id", context.userId).maybeSingle();
  if (error || data) throw new Error("Hanya Owner yang dapat mengelola tim.");
}

export const getOwnerProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOwner(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.from("products")
      .select("id,name,price,price_grosir,price_agen,cost_price,warehouse_stock,pcs_per_pack")
      .eq("user_id", context.userId).order("name");
    if (error) throw error;
    return data;
  });

export const listTeam = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOwner(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.from("team_members")
      .select("user_id,created_at,profiles!team_members_user_id_fkey(user_email,username,display_name)")
      .eq("owner_id", context.userId).order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  });

export const createSales = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    name: z.string().trim().min(1, "Nama Sales wajib diisi.").max(100),
    username: z.string().trim().min(3).max(30).regex(/^[a-zA-Z0-9._-]+$/, "Username hanya boleh berisi huruf, angka, titik, garis bawah, atau tanda minus."),
    password: z.string().min(6, "Password minimal 6 karakter.").max(72),
    ownerId: z.string().uuid().optional(),
  }).parse(input))
  .handler(async ({ context, data }) => {
    await assertOwner(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: authUser } = await context.supabase.auth.getUser();
    const isSuperAdmin = !!authUser.user && isSuperAdminEmail(authUser.user.email);
    const ownerId = isSuperAdmin ? data.ownerId : context.userId;

    if (!ownerId) throw new Error("Super Admin wajib memilih bisnis Owner untuk akun Sales.");
    if (isSuperAdmin) {
      const { data: owner, error: ownerError } = await supabaseAdmin.from("profiles")
        .select("id,role")
        .eq("id", ownerId)
        .maybeSingle();
      if (ownerError) throw ownerError;
      if (!owner || owner.role !== "owner") throw new Error("Owner bisnis tidak ditemukan.");
    }

    const username = normalizeSalesUsername(data.username);
    const name = data.name.trim();
    const { data: existing, error: lookupError } = await supabaseAdmin.from("profiles").select("id").eq("username", username).maybeSingle();
    if (lookupError) throw lookupError;
    if (existing) throw new Error("Username sudah digunakan. Pilih username lain.");

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: salesAuthEmail(username),
      password: data.password,
      email_confirm: true,
      user_metadata: { username, display_name: name, role: "sales" },
    });
    if (createError || !created.user) throw new Error(createError?.message ?? "Akun Sales gagal dibuat.");

    try {
      const { data: savedProfile, error: profileError } = await supabaseAdmin.from("profiles")
        .update({ username, display_name: name })
        .eq("id", created.user.id)
        .select("id,username,display_name")
        .single();
      if (profileError) throw profileError;
      if (savedProfile?.username !== username || savedProfile.display_name !== name) {
        throw new Error("Profil Sales gagal disimpan.");
      }

      const { error: linkError } = await supabaseAdmin.from("team_members")
        .insert({ owner_id: ownerId, user_id: created.user.id });
      if (linkError) throw linkError;
    } catch (error) {
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      if ((error as { code?: string }).code === "23505") {
        throw new Error("Username sudah digunakan. Pilih username lain.");
      }
      throw new Error((error as Error).message ?? "Akun Sales gagal dihubungkan ke tim.");
    }

    return { ok: true, username, name };
  });

export const removeSales = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertOwner(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("team_members").delete().eq("owner_id", context.userId).eq("user_id", data.userId);
    if (error) throw error;
    return { ok: true };
  });
