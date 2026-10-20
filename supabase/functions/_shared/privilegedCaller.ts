import { createClient } from "npm:@supabase/supabase-js@2.57.2";

/**
 * true si la petición viene del cron (x-cron-secret), del servidor (service_role)
 * o de un super admin verificado en servidor. La anon key NO cuenta.
 */
export async function isPrivilegedCaller(req: Request): Promise<boolean> {
  const cronSecret = Deno.env.get("CRON_SECRET");
  const provided = req.headers.get("x-cron-secret");
  if (cronSecret && provided && provided === cronSecret) return true;

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;
  const token = authHeader.slice(7);
  const srv = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (token === srv) return true;

  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, srv);
    const { data } = await sb.auth.getClaims(token);
    const claims = data?.claims;
    if (claims?.role === "service_role") return true;
    if (!claims?.sub) return false;
    const { data: isSA } = await sb.rpc("is_super_admin", { p_user_id: claims.sub });
    return isSA === true;
  } catch (error) {
    console.error("[privilegedCaller]", error);
    return false;
  }
}
