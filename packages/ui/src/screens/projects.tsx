"use client";
import { ApiError } from "@ptp/api";
import type { Principal } from "@ptp/rbac";
import { useAllProjects } from "../api-projects";
import { useApp, useSession, useT } from "../context";
import { fmtDate, fmtMoney, fmtWeekdays } from "../data";
import { AvatarStack, Button, Card, HealthBadge, Icons, PageHeader, Progress, Spinner } from "../primitives";
import { ProjectBoardScreen } from "./project-board";

export function useHealthLabel() {
  const { t } = useT();
  return { "on-track": t("dashboard.onTrack"), "at-risk": t("dashboard.atRisk"), delayed: t("dashboard.delayed"), "not-started": t("tasks.todo"), completed: t("tasks.completed") } as const;
}

/* ─── Projects list ──────────────────────────────────────────────────────── */
/** Projects list, bound to GET admin/projects/getAllProjects. */
export function ProjectsScreen() {
  const { today, navigate } = useApp();
  const { t, locale } = useT();
  const session = useSession();
  const { projects, loading, error, reload } = useAllProjects(today);
  const label = useHealthLabel();
  const canCreate = canCreateProjects(session.principal);

  return (
    <div className="animate-rise">
      <PageHeader title={t("projects.title")} subtitle={loading ? t("projects.loading") : `${projects.length} ${t("projects.allProjects").toLowerCase()}`}
        actions={canCreate && <Button icon={<Icons.plus className="h-4 w-4" />} onClick={() => navigate("/projects/new")}>{t("projects.newProject")}</Button>} />

      {loading ? (
        <Card><div className="flex items-center justify-center gap-2 py-10 text-[13px] text-ink-500"><Spinner className="h-5 w-5" />{t("projects.loading")}</div></Card>
      ) : error ? (
        <Card>
          <div role="alert" className="flex flex-col items-center gap-3 py-8 text-center">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-danger-50 text-danger-700"><Icons.warning className="h-5 w-5" /></span>
            <p className="max-w-[48ch] text-[13px] text-ink-700">{(error instanceof ApiError && error.localized(locale)) || t("projects.loadFailed")}</p>
            <Button variant="secondary" size="sm" onClick={reload}>{t("projects.retry")}</Button>
          </div>
        </Card>
      ) : projects.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-600"><Icons.projects className="h-5 w-5" /></span>
            <div>
              <p className="text-[14px] font-medium text-ink-900">{t("projects.empty")}</p>
              <p className="mt-0.5 text-[13px] text-ink-500">{t("projects.emptyBody")}</p>
            </div>
            {canCreate && <Button size="sm" icon={<Icons.plus className="h-4 w-4" />} onClick={() => navigate("/projects/new")}>{t("projects.newProject")}</Button>}
          </div>
        </Card>
      ) : (<>
      {/* Cards on mobile, table on desktop */}
      <div className="grid gap-3 md:hidden">
        {projects.map((p) => (
          <button key={p.id} type="button" onClick={() => navigate(`/projects/${p.id}`)} className="rounded-lg bg-surface p-4 text-start shadow-card transition-transform active:scale-[0.99]">
            <div className="flex items-start justify-between gap-2">
              <div><p className="font-semibold text-ink-900">{p.title}</p><p className="text-[12px] text-ink-500">{[p.category, fmtWeekdays(p.workingDays, locale)].filter(Boolean).join(" · ")}</p></div>
              <HealthBadge size="sm" health={p.health} label={label[p.health]} />
            </div>
            <div className="mt-3 flex items-center gap-3"><Progress value={p.progress} /><span className="text-[12px] tabular-nums text-ink-500">{p.progress}%</span></div>
            <div className="mt-3 flex items-center justify-between text-[12px] text-ink-500">
              <span>{t("projects.due")} {fmtDate(p.plannedDue, locale)}</span>
              <AvatarStack people={p.members} />
            </div>
          </button>
        ))}
      </div>

      <Card padded={false} className="hidden md:block">
        <div className="scroll-x">
          <table className="w-full min-w-[760px] text-[13px]">
            <thead className="bg-slate-50 text-start text-[12px] uppercase tracking-wide text-ink-500">
              <tr>
                {[t("projects.title"), t("projects.owner"), t("projects.calendar"), t("projects.progress"), t("projects.due"), t("projects.budget"), t("projects.members"), ""].map((h, i) => (
                  <th key={i} scope="col" className="px-4 py-2.5 text-start font-medium first:ps-5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {projects.map((p) => (
                <tr key={p.id} onClick={() => navigate(`/projects/${p.id}`)} className="cursor-pointer transition-colors hover:bg-slate-50">
                  <td className="px-4 py-3 first:ps-5">
                    <p className="font-medium text-ink-900">{p.title}</p>
                    {p.category && <p className="text-[12px] text-ink-500">{p.category}</p>}
                  </td>
                  <td className="px-4 py-3 text-ink-700">{p.ownerName}</td>
                  <td className="px-4 py-3 text-ink-700">{fmtWeekdays(p.workingDays, locale)}</td>
                  <td className="px-4 py-3"><div className="flex items-center gap-2"><div className="w-24"><Progress value={p.progress} tone={p.health === "delayed" ? "danger" : p.health === "at-risk" ? "warn" : "brand"} /></div><span className="tabular-nums text-ink-500">{p.progress}%</span></div></td>
                  <td className="px-4 py-3 tabular-nums text-ink-700">{fmtDate(p.plannedDue, locale)}</td>
                  <td className="px-4 py-3 tabular-nums text-ink-700">{fmtMoney(p.cost.budget, locale, p.cost.currency)}</td>
                  <td className="px-4 py-3"><AvatarStack people={p.members} /></td>
                  <td className="px-4 py-3"><HealthBadge size="sm" health={p.health} label={label[p.health]} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      </>)}
    </div>
  );
}

/** Owners, org admins/owners and the super admin can start new projects. */
export function canCreateProjects(p: Principal): boolean {
  return !!p.superAdmin || p.orgRole !== "org_member" || p.defaultRole === "owner" || Object.values(p.projectRoles).includes("owner");
}

/* ─── Task board ─────────────────────────────────────────────────────────── */
/** One project → its board from the backend; no project → pick a project to open its board. */
export function TaskBoardScreen({ projectId }: { projectId?: string }) {
  return projectId ? <ProjectBoardScreen projectId={projectId} /> : <TasksProjectPicker />;
}

/** Tasks live on each project's board (GET getBoard), so the Tasks page lists projects to open. */
function TasksProjectPicker() {
  const { today, navigate } = useApp();
  const { t, locale } = useT();
  const label = useHealthLabel();
  const { projects, loading, error, reload } = useAllProjects(today);

  return (
    <div className="animate-rise">
      <PageHeader title={t("tasks.title")} subtitle={t("tasks.pickProject")} />
      {loading ? (
        <Card><div className="flex items-center justify-center gap-2 py-10 text-[13px] text-ink-500"><Spinner className="h-5 w-5" />{t("projects.loading")}</div></Card>
      ) : error ? (
        <Card>
          <div role="alert" className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="max-w-[48ch] text-[13px] text-ink-700">{(error instanceof ApiError && error.localized(locale)) || t("projects.loadFailed")}</p>
            <Button variant="secondary" size="sm" onClick={reload}>{t("projects.retry")}</Button>
          </div>
        </Card>
      ) : projects.length === 0 ? (
        <Card><p className="py-8 text-center text-[13px] text-ink-500">{t("projects.empty")}</p></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => (
            <button key={p.id} type="button" onClick={() => navigate(`/projects/${p.id}`)}
              className="rounded-lg border border-transparent bg-surface p-4 text-start shadow-card transition-colors hover:border-brand-600">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><p className="truncate font-semibold text-ink-900">{p.title}</p>{p.category && <p className="truncate text-[12px] text-ink-500">{p.category}</p>}</div>
                <HealthBadge size="sm" health={p.health} label={label[p.health]} />
              </div>
              <div className="mt-3 flex items-center gap-3"><Progress value={p.progress} /><span className="text-[12px] tabular-nums text-ink-500">{p.progress}%</span></div>
              <p className="mt-2 flex items-center justify-between text-[12px] text-ink-500">
                <span>{t("projects.due")} {fmtDate(p.plannedDue, locale)}</span>
                <span className="inline-flex items-center gap-1 font-medium text-brand-700">{t("tasks.openBoard")}<Icons.chevron className="h-3.5 w-3.5" /></span>
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
