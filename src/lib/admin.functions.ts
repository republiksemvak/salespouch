import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (error || !data) throw new Error("Hanya super admin");
}

export const setUserLicense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      userId: z.string().uuid(),
      mode: z.enum(["add", "set", "revoke"]),
      days: z.number().int().min(0).max(3650).optional(),
      until: z.string().optional(),
    }).parse(d),
  )
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
