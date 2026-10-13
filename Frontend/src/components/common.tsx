import { AlertTriangle, CheckCircle2, Clock, Database, Inbox, RefreshCw, ShieldAlert, WifiOff } from "lucide-react";
import type { ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useI18n, type TKey } from "@/lib/i18n";
import { isStale, timeAgo } from "@/lib/format";
import { useOnline } from "@/hooks/use-data";
import { readCached } from "@/services/offline";

const pill = cva("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap", {
  variants: {
    tone: {
      neutral: "bg-muted text-muted-foreground border-border",
      info: "bg-accent text-accent-foreground border-transparent",
      success: "bg-success/12 text-success border-success/25",
      warning: "bg-warning/15 text-warning-foreground border-warning/40",
      danger: "bg-destructive/10 text-destructive border-destructive/30",
      navy: "bg-navy text-navy-foreground border-transparent",
    },
  },
  defaultVariants: { tone: "neutral" },
});
export type Tone = NonNullable<VariantProps<typeof pill>["tone"]>;

export function Pill({ tone, className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return <span className={cn(pill({ tone }), className)}>{children}</span>;
}

const STATUS_TONE: Record<string, Tone> = {
  unverified: "warning",
  under_review: "info",
  verified: "success",
  rejected: "danger",
  resolved: "neutral",
  outdated: "neutral",
  submitted: "info",
  assigned: "navy",
  in_progress: "navy",
  pending: "warning",
  reviewed: "info",
  matched: "navy",
  accepted: "navy",
  dispatched: "navy",
  delivered: "success",
  cancelled: "neutral",
  draft: "neutral",
  info_required: "warning",
  approved: "success",
  completed: "success",
};

export function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  return <Pill tone={STATUS_TONE[status] ?? "neutral"}>{t(`status.${status}` as TKey)}</Pill>;
}

export function SeverityBadge({ severity }: { severity: string }) {
  const { t } = useI18n();
  const tone: Tone = severity === "severe" || severity === "high" ? "danger" : severity === "moderate" ? "warning" : "neutral";
  return <Pill tone={tone}>{t(`sev.${severity}` as TKey)}</Pill>;
}

export function VerifiedBadge({ verified }: { verified: boolean }) {
  const { t } = useI18n();
  return verified ? (
    <Pill tone="success"><CheckCircle2 className="size-3" />{t("common.verified")}</Pill>
  ) : (
    <Pill tone="warning"><ShieldAlert className="size-3" />{t("common.unverified")}</Pill>
  );
}

export function DemoBadge() {
  const { t } = useI18n();
  return <Pill tone="warning"><Database className="size-3" />{t("demo.label")}</Pill>;
}

export function Freshness({ at, staleHours = 12 }: { at: string; staleHours?: number }) {
  const { t, lang } = useI18n();
  const stale = isStale(at, staleHours);
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", stale ? "text-warning-foreground" : "text-muted-foreground")}>
      <Clock className="size-3" />
      {t("common.updated")} {timeAgo(at, lang)}
      {stale && <span className="font-semibold">· {t("common.stale")}</span>}
    </span>
  );
}

export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: string; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="border-b border-border/70 bg-card">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-7 sm:px-6 sm:py-9 md:flex-row md:items-end md:justify-between">
        <div className="max-w-3xl border-l-[3px] border-primary pl-4 sm:pl-5">
          {eyebrow && <div className="mb-3">{eyebrow}</div>}
          <h1 className="text-2xl font-bold leading-tight text-foreground sm:text-3xl">{title}</h1>
          {description && <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 md:justify-end">{actions}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ title, children }: { title?: string; children?: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center text-muted-foreground">
      <Inbox className="mb-2 size-6" />
      <p className="font-medium text-foreground">{title ?? t("common.empty")}</p>
      {children && <div className="mt-1 text-sm">{children}</div>}
    </div>
  );
}

export function ErrorState({ onRetry, message }: { onRetry?: () => void; message?: string }) {
  const { t } = useI18n();
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-lg border border-destructive/25 bg-destructive/[0.06] p-6 text-center shadow-sm">
      <span className="flex size-10 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="size-5 text-destructive" />
      </span>
      <p className="max-w-prose text-sm font-medium leading-6">{message ?? t("common.error")}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw /> {t("common.retry")}
        </Button>
      )}
    </div>
  );
}

export function ListSkeleton({ rows = 3 }: { rows?: number | undefined }) {
  return (
    <div className="space-y-3" aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-20 w-full rounded-xl" />
      ))}
    </div>
  );
}

/** Generic query renderer: loading / error / empty / data. */
export function QueryState<T>({
  q,
  empty,
  children,
  rows,
}: {
  q: { data?: T[]; isLoading: boolean; isError: boolean; refetch: () => unknown };
  empty?: ReactNode;
  rows?: number | undefined;
  children: (data: T[]) => ReactNode;
}) {
  if (q.isLoading) return <ListSkeleton rows={rows} />;
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;
  if (!q.data || q.data.length === 0) return <>{empty ?? <EmptyState />}</>;
  return <>{children(q.data)}</>;
}

export function OfflineBar() {
  const online = useOnline();
  const { t } = useI18n();
  const alerts = readCached<unknown[]>("alerts");
  if (online && !alerts) return null;
  return (
    <div role="status" className="flex items-center justify-center gap-2 bg-warning px-4 py-2 text-sm font-medium text-warning-foreground">
      <WifiOff className="size-4" /> {online ? `Cached data · ${new Date(alerts?.syncedAt ?? "").toLocaleString()}` : t("common.offline")}
    </div>
  );
}

export function Section({ title, description, action, children, className }: { title: ReactNode; description?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("card-surface min-w-0 p-4 sm:p-5", className)}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0"><h2 className="font-semibold leading-6 text-foreground">{title}</h2>{description && <p className="mt-1 max-w-3xl text-sm leading-5 text-muted-foreground">{description}</p>}</div>
        {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
      </div>
      {children}
    </section>
  );
}

export function Notice({ tone = "info", icon, children }: { tone?: "info" | "danger" | "warning"; icon?: ReactNode; children: ReactNode }) {
  const cls =
    tone === "danger"
      ? "border-destructive/30 bg-destructive/5 text-foreground"
      : tone === "warning"
        ? "border-warning/40 bg-warning/10 text-foreground"
        : "border-teal/30 bg-accent text-accent-foreground";
  return (
    <div className={cn("flex gap-3 rounded-lg border p-4 text-sm leading-6 shadow-sm", cls)}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function StatusTimeline({ steps, current }: { steps: string[]; current: string }) {
  const { t } = useI18n();
  const idx = steps.indexOf(current);
  return (
    <ol className="flex flex-col gap-3 sm:flex-row sm:gap-0">
      {steps.map((s, i) => {
        const done = i <= idx;
        return (
          <li key={s} className="flex flex-1 items-center gap-2 sm:flex-col sm:text-center">
            <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold", done ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground")}>{i + 1}</span>
            <span className={cn("text-xs", done ? "font-semibold" : "text-muted-foreground")}>{t(`status.${s}` as TKey)}</span>
          </li>
        );
      })}
    </ol>
  );
}
