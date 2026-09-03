/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Trash2, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ROLE_LABEL, ROLE_OPTIONS } from "@/lib/permissions";
import {
  addTeamMember,
  listTeam,
  removeTeamMember,
  updateTeamMember,
} from "@/lib/team.functions";

export function TeamAccess({ businessId, canManage }: { businessId: string; canManage: boolean }) {
  const queryClient = useQueryClient();
  const fetchTeam = useServerFn(listTeam);
  const addFn = useServerFn(addTeamMember);
  const updateFn = useServerFn(updateTeamMember);
  const removeFn = useServerFn(removeTeamMember);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("employee");

  const teamQuery = useQuery({
    queryKey: ["team", businessId],
    enabled: !!businessId && canManage,
    queryFn: () => fetchTeam({ data: { businessId } }) as Promise<any[]>,
  });

  // Seat cap comes from the plan entitlements, not from the role system.
  const seats = useLimit("max_users", teamQuery.data?.length ?? 0);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["team", businessId] });


  const add = useMutation({
    mutationFn: () => addFn({ data: { businessId, email, role: role as any } }),
    onSuccess: () => {
      toast.success("Team member added");
      setEmail("");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not add that team member"),
  });

  const changeRole = useMutation({
    mutationFn: (v: { memberId: string; role: string }) =>
      updateFn({ data: { businessId, memberId: v.memberId, role: v.role as any } }),
    onSuccess: () => {
      toast.success("Role updated");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not update the role"),
  });

  const remove = useMutation({
    mutationFn: (memberId: string) => removeFn({ data: { businessId, memberId } }),
    onSuccess: () => {
      toast.success("Team member removed");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not remove that member"),
  });

  if (!canManage) {
    return (
      <p className="text-xs text-muted-foreground">
        Only owners and admins can add team members or change their roles.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)_auto] sm:items-end">
        <div className="min-w-0">
          <Label htmlFor="member-email" className="text-xs">
            Member email
          </Label>
          <Input
            id="member-email"
            type="email"
            className="mt-1.5"
            placeholder="teammate@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="min-w-0">
          <Label className="text-xs">Role</Label>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger className="mt-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLE_OPTIONS.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          onClick={() => add.mutate()}
          disabled={!email || add.isPending || seats.reached}
        >
          {add.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <UserPlus className="size-4" />
          )}
          Add member
        </Button>
      </div>

      {seats.reached && (
        <p className="text-xs text-destructive">
          Your plan includes {seats.max} team member{seats.max === 1 ? "" : "s"}. Upgrade in
          Billing to invite more.
        </p>
      )}



      <p className="text-xs text-muted-foreground">
        {ROLE_OPTIONS.find((r) => r.value === role)?.description}
      </p>

      {teamQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border">
          {(teamQuery.data ?? []).map((m: any) => (
            <div key={m.id} className="flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{m.full_name ?? m.email ?? "Member"}</p>
                <p className="truncate text-xs text-muted-foreground">{m.email}</p>
              </div>
              {m.role === "owner" ? (
                <Badge>Owner</Badge>
              ) : (
                <>
                  <Select
                    value={m.role}
                    onValueChange={(v) => changeRole.mutate({ memberId: m.id, role: v })}
                  >
                    <SelectTrigger className="w-52">
                      <SelectValue>{ROLE_LABEL[m.role] ?? m.role}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remove member"
                    onClick={() => remove.mutate(m.id)}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </>
              )}
            </div>
          ))}
          {(teamQuery.data ?? []).length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">No team members yet.</p>
          )}
        </div>
      )}

      <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
        <p className="mb-1 font-medium text-foreground">What each role can open</p>
        <ul className="space-y-0.5">
          {ROLE_OPTIONS.map((r) => (
            <li key={r.value}>
              <span className="font-medium text-foreground">{r.label}:</span> {r.description}
            </li>
          ))}
          <li>
            <span className="font-medium text-foreground">Owner:</span> everything, and the only
            role that can approve purchase orders.
          </li>
        </ul>
      </div>
    </div>
  );
}
