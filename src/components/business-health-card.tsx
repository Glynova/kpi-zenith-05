import { ChevronDown } from "lucide-react";

import { BUSINESS_HEALTH_CONFIG, type BusinessHealthResult } from "@/lib/kpi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";

export function BusinessHealthCard({
  health,
  error = false,
  periodLabel,
}: {
  health: BusinessHealthResult;
  error?: boolean;
  periodLabel?: string;
}) {
  if (error) {
    return (
      <Card className="surface-card border-0">
        <CardHeader>
          <CardTitle className="text-base">Business Health</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive" role="status">
            Could not load
          </p>
        </CardContent>
      </Card>
    );
  }

  if (health.state === "insufficient_data") {
    return (
      <Card className="surface-card border-0">
        <CardHeader>
          <CardTitle className="text-base">Business Health</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="font-medium">{health.label}</p>
          {periodLabel ? (
            <p className="text-xs text-muted-foreground">Score period: {periodLabel}</p>
          ) : null}
          {health.notes.map((note) => (
            <p key={note} className="text-sm text-muted-foreground">
              {note}
            </p>
          ))}
        </CardContent>
      </Card>
    );
  }

  const score = health.score ?? 0;
  return (
    <Card className="surface-card border-0">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Business Health</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-display text-3xl font-semibold tabular-nums">{score}/100</p>
            <p className="text-sm text-muted-foreground">{health.label}</p>
            {periodLabel ? (
              <p className="mt-1 text-xs text-muted-foreground">Score period: {periodLabel}</p>
            ) : null}
          </div>
          <div
            className="grid size-16 place-items-center rounded-full border-4 text-sm font-semibold"
            style={{
              borderColor:
                score >= BUSINESS_HEALTH_CONFIG.labels.healthy
                  ? "hsl(var(--success))"
                  : score >= BUSINESS_HEALTH_CONFIG.labels.watch
                    ? "hsl(var(--warning))"
                    : "hsl(var(--destructive))",
            }}
            role="img"
            aria-label={`Business health ${health.label}: ${score} out of 100`}
          >
            {score}
          </div>
        </div>
        <Collapsible className="mt-4">
          <CollapsibleTrigger className="group flex w-full items-center justify-between border-t border-border pt-3 text-left text-sm font-medium">
            Component breakdown
            <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 pt-4">
            {health.components.map((component) => (
              <div key={component.key} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium">{component.label}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {component.points.toFixed(1)} / {component.maxPoints}
                  </span>
                </div>
                <Progress
                  value={
                    component.maxPoints > 0 ? (component.points / component.maxPoints) * 100 : 0
                  }
                  aria-label={`${component.label} points`}
                />
                <p className="text-xs text-muted-foreground">{component.explanation}</p>
              </div>
            ))}
            {health.notes.map((note) => (
              <p key={note} className="text-xs text-muted-foreground">
                {note}
              </p>
            ))}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
