import { useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";

import { db, type Row } from "@/lib/db";
import { useBusiness } from "@/lib/business-context";
import { Button } from "@/components/ui/button";

/**
 * Header bell. Runs the server-side alert sweep once per business per session
 * (low stock, pending approvals, overdue invoices/debts/bills) and shows the
 * unread count. The sweep itself is idempotent — it never duplicates an alert
 * that is already unread.
 */
export function AlertBell() {
  const { businessId } = useBusiness();
  const queryClient = useQueryClient();
  const scanned = useRef<string | null>(null);

  const { data = [] } = useQuery({
    queryKey: ["notifications", businessId],
    enabled: !!businessId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await db
        .from("notifications")
        .select("*")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  useEffect(() => {
    if (!businessId || scanned.current === businessId) return;
    scanned.current = businessId;
    void (async () => {
      const { error } = await db.rpc("scan_business_alerts", { _business_id: businessId });
      if (!error) queryClient.invalidateQueries({ queryKey: ["notifications", businessId] });
    })();
  }, [businessId, queryClient]);

  const unread = data.filter((n) => !n.is_read).length;

  return (
    <Button variant="ghost" size="icon" asChild aria-label={`Notifications (${unread} unread)`}>
      <Link to="/notifications" className="relative">
        <Bell className="size-4" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-4 text-destructive-foreground">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Link>
    </Button>
  );
}
