/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, Loader2, RefreshCw, Trash2, UserPlus, X } from "lucide-react";

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
import { useLimit } from "@/lib/use-subscription";

import {
  addTeamMember,
  listInvitations,
  listTeam,
  removeTeamMember,
  revokeInvitation,
  updateTeamMember,
} from "@/lib/team.functions";

function copyLink(link: string) {
  navigator.clipboard?.writeText(link).then(
    () => toast.success("Join link copied"),
    () => toast.message("Copy this link", { description: link }),
  );
}

export function TeamAccess({ businessId, canManage }: { businessId: string; canManage: boolean }) {
  const queryClient = useQueryClient();
  const fetchTeam = useServerFn(listTeam);
  const addFn = useServerFn(addTeamMember);
  const updateFn = useServerFn(updateTeamMember);
  const removeFn = useServerFn(removeTeamMember);
  const listInvFn = useServerFn(listInvitations);
  const revokeFn = useServerFn(revokeInvitation);
  const [lastLink, setLastLink] = useState<{ email: string; link: string } | null>(null);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("employee");

  const teamQuery = useQuery({
    queryKey: ["team", businessId],
    enabled: !!businessId && canManage,
    queryFn: () => fetchTeam({ data: { businessId } }) as Promise<any[]>,
  });

  // Seat cap comes from the plan entitlements, not from the role system.
  const seats = useLimit("max_users", teamQuery.data?.length ?? 0);

  const invitesQuery = useQuery({
    queryKey: ["team-invites", businessId],
    enabled: !!businessId && canManage,
    queryFn: () => listInvFn({ data: { businessId } }),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["team", businessId] });
    queryClient.invalidateQueries({ queryKey: ["team-invites", businessId] });
  };

  const invite = useMutation({
    mutationFn: (v: { email: string; role: string }) =>
      addFn({ data: { businessId, email: v.email, role: v.role as any, origin: window.location.origin } }),
    onSuccess: (r) => {
      toast.success(r.reissued ? "New join link created" : "Invitation created");
      setLastLink({ email: r.email, link: r.link });
      copyLink(r.link);
      setEmail("");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not invite that person"),
  });
  const add = { mutate: () => invite.mutate({ email, role }), isPending: invite.isPending };

  const revoke = useMutation({
    mutationFn: (invitationId: string) => revokeFn({ data: { businessId, invitationId } }),
    onSuccess: () => {
      toast.success("Invitation cancelled");
      setLastLink(null);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not cancel the invitation"),
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
        <Button onClick={() => add.mutate()} disabled={!email || add.isPending || seats.reached}>
          {add.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <UserPlus className="size-4" />
          )}
          Invite
        </Button>
      </div>

      {lastLink && (
        <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs">
          <p className="font-medium text-foreground">Send this join link to {lastLink.email}</p>
          <p className="mt-1 text-muted-foreground">
            They sign in or create their own login with that email, then join this workspace. They
            set their own password; the link works once and expires in 7 days.
          </p>
          <div className="mt-2 flex min-w-0 items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-background px-2 py-1">{lastLink.link}</code>
            <Button size="sm" variant="outline" onClick={() => copyLink(lastLink.link)}>
              <Copy className="size-4" /> Copy
            </Button>
          </div>
        </div>
      )}

      {(invitesQuery.data ?? []).length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium">Pending invitations</p>
          <div className="divide-y divide-border rounded-lg border border-border">
            {(invitesQuery.data ?? []).map((i) => {
              const expired = new Date(i.expires_at) < new Date();
              return (
                <div key={i.id} className="flex flex-wrap items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{i.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {ROLE_LABEL[i.role] ?? i.role} ·{" "}
                      {expired ? "Expired" : `Expires ${new Date(i.expires_at).toLocaleDateString()}`}
                    </p>
                  </div>
                  {expired && <Badge variant="outline">Expired</Badge>}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={invite.isPending}
                    onClick={() => invite.mutate({ email: i.email, role: i.role })}
                  >
                    <RefreshCw className="size-4" /> New link
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Cancel invitation"
                    onClick={() => revoke.mutate(i.id)}
                  >
                    <X className="size-4 text-destructive" />
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {seats.reached && (
        <p className="text-xs text-destructive">
          Your plan includes {seats.max} team member{seats.max === 1 ? "" : "s"}. Upgrade in Billing
          to invite more.
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
