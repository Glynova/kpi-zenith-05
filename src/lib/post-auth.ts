import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/db";

/** Where a signed-in user should land: their workspace, or onboarding if they have no business yet. */
export async function postAuthDestination(): Promise<"/dashboard" | "/onboarding"> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return "/onboarding";
  const { count } = await db
    .from("user_businesses")
    .select("id", { count: "exact", head: true })
    .eq("user_id", data.user.id)
    .eq("status", "active");
  return (count ?? 0) > 0 ? "/dashboard" : "/onboarding";
}
