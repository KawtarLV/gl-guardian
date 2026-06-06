// Bootstrap a company on first login; expose current-user company info.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getOrCreateCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase
      .from("company_members")
      .select("company_id, companies(id, name)")
      .eq("user_id", userId)
      .maybeSingle();
    if (existing?.company_id) {
      const co = Array.isArray(existing.companies) ? existing.companies[0] : existing.companies;
      return { companyId: existing.company_id, companyName: co?.name ?? "My Company" };
    }
    // Create
    const { data: newCo, error: e1 } = await supabase
      .from("companies")
      .insert({ name: "My Company" })
      .select("id, name")
      .single();
    if (e1 || !newCo) throw new Error(e1?.message ?? "Failed to create company");
    const { error: e2 } = await supabase
      .from("company_members")
      .insert({ company_id: newCo.id, user_id: userId });
    if (e2) throw new Error(e2.message);
    // Admin role
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("user_roles").insert({
      user_id: userId, company_id: newCo.id, role: "admin",
    });
    return { companyId: newCo.id, companyName: newCo.name };
  });

export const getMyCompany = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("company_members")
      .select("company_id, companies(id, name)")
      .eq("user_id", userId)
      .maybeSingle();
    if (!data) return null;
    const co = Array.isArray(data.companies) ? data.companies[0] : data.companies;
    return { companyId: data.company_id, companyName: co?.name ?? "My Company" };
  });
