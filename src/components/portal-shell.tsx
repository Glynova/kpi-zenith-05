import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, LogOut, Moon, Sun, type LucideIcon } from "lucide-react";

import { BrandLogo } from "@/components/brand-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export type PortalNavItem = { title: string; url: string; icon: LucideIcon };

/**
 * Shell shared by the Affiliate Partner Portal and the Platform Admin Portal.
 * Deliberately distinct from the ERP workspace chrome so it is always obvious
 * which surface you are on.
 */
export function PortalShell({
  label,
  tone,
  items,
  children,
}: {
  label: string;
  tone: "partner" | "admin";
  items: PortalNavItem[];
  children: ReactNode;
}) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { theme, toggle } = useTheme();

  return (
    <div className="min-h-screen bg-background">
      <header
        className={cn(
          "sticky top-0 z-40 border-b backdrop-blur",
          tone === "admin"
            ? "border-destructive/30 bg-destructive/5"
            : "border-primary/30 bg-primary/5",
        )}
      >
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <BrandLogo />
          <Badge
            variant={tone === "admin" ? "destructive" : "default"}
            className="uppercase tracking-wide"
          >
            {label}
          </Badge>
          <div className="ml-auto flex items-center gap-1">
            <Button asChild variant="ghost" size="sm">
              <Link to="/dashboard">
                <ArrowLeft className="size-4" /> <span className="hidden sm:inline">Workspace</span>
              </Link>
            </Button>
            <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Sign out"
              onClick={() => void supabase.auth.signOut()}
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
        <nav className="mx-auto max-w-7xl overflow-x-auto px-4 sm:px-6">
          <ul className="flex min-w-max gap-1 pb-2">
            {items.map((item) => {
              const active = pathname === item.url;
              return (
                <li key={item.url}>
                  <Link
                    to={item.url}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors",
                      active
                        ? "bg-primary text-primary-foreground shadow-elevate-1"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <item.icon className="size-4" />
                    {item.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-elevate-1">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        {Icon && <Icon className="size-4 text-primary" />}
      </div>
      <p className="mt-2 font-display text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
