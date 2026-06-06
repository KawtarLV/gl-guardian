// Bootstrap a company on first login; expose current-user company info.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getOrCreateCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing } = await supabaseAdmin
      .from("company_members")
      .select("company_id, companies(id, name)")
      .eq("user_id", userId)
      .maybeSingle();
    if (existing?.company_id) {
      const co = Array.isArray(existing.companies) ? existing.companies[0] : existing.companies;
      return { companyId: existing.company_id, companyName: co?.name ?? "My Company" };
    }

    const { data: newCo, error: e1 } = await supabaseAdmin
      .from("companies")
      .insert({ name: "My Company" })
      .select("id, name")
      .single();
    if (e1 || !newCo) throw new Error(e1?.message ?? "Failed to create company");

    await supabaseAdmin.from("company_members").insert({ company_id: newCo.id, user_id: userId });
    await supabaseAdmin.from("user_roles").insert({
      user_id: userId, company_id: newCo.id, role: "admin",
    });
    return { companyId: newCo.id, companyName: newCo.name };
  });

export const getMyCompany = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("company_members")
      .select("company_id, companies(id, name)")
      .eq("user_id", userId)
      .maybeSingle();
    if (!data) return null;
    const co = Array.isArray(data.companies) ? data.companies[0] : data.companies;
    return { companyId: data.company_id, companyName: co?.name ?? "My Company" };
  });
