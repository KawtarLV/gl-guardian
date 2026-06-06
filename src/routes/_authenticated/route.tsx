import { createFileRoute, Outlet, redirect, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getOrCreateCompany } from "@/lib/company.functions";
import { Building2, Upload, LineChart, FolderKanban, LogOut, BarChart3, Briefcase, HardHat, Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const navigate = useNavigate();
  const bootstrap = useServerFn(getOrCreateCompany);
  const { data: company } = useQuery({
    queryKey: ["company"],
    queryFn: () => bootstrap({ data: undefined as never }),
  });

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="w-60 bg-sidebar text-sidebar-foreground flex flex-col p-4 gap-1">
        <div className="flex items-center gap-2 px-2 py-3 mb-4">
          <div className="w-8 h-8 rounded bg-sidebar-primary text-sidebar-primary-foreground flex items-center justify-center font-bold">C</div>
          <div>
            <div className="font-semibold text-sm">Cashflow</div>
            <div className="text-xs text-sidebar-foreground/60 truncate max-w-[140px]">{company?.companyName ?? "—"}</div>
          </div>
        </div>
        <NavLink to="/dashboard" icon={<Building2 size={16} />}>Dashboard</NavLink>
        <NavLink to="/upload" icon={<Upload size={16} />}>Upload & Map</NavLink>
        <NavLink to="/forecast" icon={<LineChart size={16} />}>Forecast</NavLink>
        <NavLink to="/cfo" icon={<BarChart3 size={16} />}>CFO Dashboard</NavLink>
        <NavLink to="/pe-board" icon={<Landmark size={16} />}>PE Board</NavLink>
        <NavLink to="/opco" icon={<HardHat size={16} />}>Opco MD</NavLink>
        <NavLink to="/project-lead" icon={<Briefcase size={16} />}>Project Lead</NavLink>
        <NavLink to="/projects" icon={<FolderKanban size={16} />}>Projects</NavLink>
        <div className="mt-auto">
          <Button variant="ghost" size="sm" onClick={signOut} className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
            <LogOut size={16} className="mr-2" /> Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}

function NavLink({ to, icon, children }: { to: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
      activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground" }}
    >
      {icon} {children}
    </Link>
  );
}
