import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertOwner(context: { supabase: any; userId: string }) {
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
    const { data, error } = await supabaseAdmin.from("team_members").select("user_id,created_at,profiles!team_members_user_id_fkey(user_email)").eq("owner_id", context.userId).order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  });

export const inviteSales = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ email: z.email().max(254) }).parse(input))
  .handler(async ({ context, data }) => {
    await assertOwner(context);
    const email = data.email.trim().toLowerCase();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: invited, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email);
    if (error || !invited.user) throw new Error(error?.message ?? "Undangan gagal dibuat.");
    const { error: linkError } = await supabaseAdmin.from("team_members").insert({ owner_id: context.userId, user_id: invited.user.id });
    if (linkError) throw new Error(`Akun dibuat, tetapi tidak terhubung ke tim: ${linkError.message}`);
    return { ok: true };
  });

export const removeSales = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ userId: z.uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertOwner(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("team_members").delete().eq("owner_id", context.userId).eq("user_id", data.userId);
    if (error) throw error;
    return { ok: true };
  });