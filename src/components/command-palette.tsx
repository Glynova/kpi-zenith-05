import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Moon, Sun, LogOut, Plus, Building2 } from "lucide-react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { flatNavItems } from "@/lib/nav";
import { canAccessRoute } from "@/lib/permissions";
import { useBusiness } from "@/lib/business-context";
import { useTheme } from "@/lib/theme";

export function CommandPalette({
  open,
  onOpenChange,
  onSignOut,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSignOut: () => void;
}) {
  const navigate = useNavigate();
  const { role, feature } = useBusiness();
  const { theme, toggle } = useTheme();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const items = flatNavItems().filter(
    (i) => canAccessRoute(role, i.url) && (!i.feature || feature(i.feature)),
  );

  const groups = Array.from(new Set(items.map((i) => i.group)));

  function run(fn: () => void) {
    onOpenChange(false);
    // Let the dialog close before navigating for a smooth transition.
    requestAnimationFrame(fn);
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search pages and actions..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {groups.map((group) => (
          <CommandGroup key={group} heading={group}>
            {items
              .filter((i) => i.group === group)
              .map((item) => (
                <CommandItem
                  key={item.url}
                  value={`${item.group} ${item.title} ${item.keywords ?? ""}`}
                  onSelect={() => run(() => navigate({ to: item.url }))}
                >
                  <item.icon className="size-4" />
                  <span>{item.title}</span>
                </CommandItem>
              ))}
          </CommandGroup>
        ))}
        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem
            value="new product create item"
            onSelect={() => run(() => navigate({ to: "/products" }))}
          >
            <Plus className="size-4" />
            <span>New product</span>
          </CommandItem>
          <CommandItem
            value="switch business new business"
            onSelect={() => run(() => navigate({ to: "/onboarding" }))}
          >
            <Building2 className="size-4" />
            <span>Add a business</span>
          </CommandItem>
          <CommandItem value="toggle theme dark light" onSelect={() => run(toggle)}>
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            <span>Switch to {theme === "dark" ? "light" : "dark"} mode</span>
          </CommandItem>
          <CommandItem value="sign out logout" onSelect={() => run(onSignOut)}>
            <LogOut className="size-4" />
            <span>Sign out</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
