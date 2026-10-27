"use client";
import { useEffect, useMemo, useState } from "react";
import { ApiError } from "@ptp/api";
import { useAllProjects } from "../api-projects";
import { useApp, useSession, useT } from "../context";
import { fmtDate } from "../data";
import { Button, Card, EmptyState, HealthBadge, PageHeader, Progress, Spinner, StatTile, cx } from "../primitives";

/** Portfolio dashboard, built from GET admin/projects/getAllProjects. */
export function DashboardScreen() {
  const { today, navigate } = useApp();
  const { t, locale } = useT();
  const session = useSession();
  const { projects, loading, error, reload } = useAllProjects(today);
  // Time-of-day greeting is resolved after mount so server and client markup match (no hydration mismatch).
  const [hour, setHour] = useState<number | null>(null);
  useEffect(() => setHour(new Date().getHours()), []);
  const h = hour ?? 9;
  const period = locale === "ar" ? (h < 12 ? "صباح الخير" : "مساء الخير") : h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
  const healthLabel = { "on-track": t("dashboard.onTrack"), "at-risk": t("dashboard.atRisk"), delayed: t("dashboard.delayed"), "not-started": t("tasks.todo"), completed: t("tasks.completed") } as const;

  const counts = useMemo(() => ({
    onTrack: projects.filter((p) => p.health === "on-track").length,
    atRisk: projects.filter((p) => p.health === "at-risk").length,
    delayed: projects.filter((p) => p.health === "delayed").length,
  }), [projects]);

  return (
    <div className="animate-rise">
      <PageHeader title={t("dashboard.greeting", { period, name: session.user.name.split(" ")[0] })} subtitle={t("dashboard.title")} />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatTile label={t("projects.allProjects")} value={loading ? "—" : projects.length} />
        <StatTile label={t("dashboard.onTrack")} value={loading ? "—" : counts.onTrack} />
        <StatTile label={t("dashboard.atRisk")} value={loading ? "—" : counts.atRisk} />
        <StatTile label={t("dashboard.delayed")} value={loading ? "—" : counts.delayed} hint={t("dashboard.delayedQueueHint")} />
      </div>

      <Card title={t("dashboard.health")} className="mt-4" padded={false}
        action={!loading && !error && projects.length > 0 ? <div className="flex gap-1.5 text-[12px]"><Dot tone="ok" n={counts.onTrack} /><Dot tone="warn" n={counts.atRisk} /><Dot tone="danger" n={counts.delayed} /></div> : undefined}>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-[13px] text-ink-500"><Spinner className="h-5 w-5" />{t("projects.loading")}</div>
        ) : error ? (
          <div role="alert" className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="max-w-[48ch] text-[13px] text-ink-700">{(error instanceof ApiError && error.localized(locale)) || t("projects.loadFailed")}</p>
            <Button variant="secondary" size="sm" onClick={reload}>{t("projects.retry")}</Button>
          </div>
        ) : projects.length === 0 ? (
          <EmptyState title={t("projects.empty")} body={t("projects.emptyBody")} />
        ) : (
          <ul className="divide-y divide-line">
            {projects.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => navigate(`/projects/${p.id}`)} className="flex w-full items-center gap-3 px-4 py-3 text-start transition-colors hover:bg-slate-50 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate font-medium text-ink-900">{p.title}</p>
                      <HealthBadge size="sm" health={p.health} label={healthLabel[p.health]} />
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      <Progress value={p.progress} tone={p.health === "delayed" ? "danger" : p.health === "at-risk" ? "warn" : "brand"} />
                      <span className="w-9 text-end text-[12px] tabular-nums text-ink-500">{p.progress}%</span>
                    </div>
                    <p className="mt-1 text-[12px] text-ink-500">{t("projects.due")} {fmtDate(p.plannedDue, locale)}{p.category && ` · ${p.category}`}</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Dot({ tone, n }: { tone: "ok" | "warn" | "danger"; n: number }) {
  const c = { ok: "bg-ok-600", warn: "bg-warn-600", danger: "bg-danger-600" }[tone];
  return <span className="inline-flex items-center gap-1 tabular-nums text-ink-500"><span className={cx("h-2 w-2 rounded-full", c)} />{n}</span>;
}
