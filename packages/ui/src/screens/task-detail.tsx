"use client";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ApiError, tasksApi, type BoardColumn, type UpdateTaskBody } from "@ptp/api";
import type { HealthStatus } from "@ptp/forecast";
import { useApiUsers } from "../api-users";
import { useApp, useCan, useT } from "../context";
import { fmtDate } from "../data";
import { initialsOf, type Priority } from "../models";
import { Avatar, Button, Card, Field, HealthBadge, Icons, Input, Modal, PageHeader, Pill, PriorityDot, Progress, Select, Spinner, TextArea, cx } from "../primitives";
import { useHealthLabel } from "./projects";

/** Task details, bound to GET /admin/tasks/getTask/:taskId (task, forecast and comments). */
type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const str = (...vs: unknown[]) => { for (const v of vs) if (typeof v === "string" && v.trim()) return v.trim(); return undefined; };
const num = (...vs: unknown[]) => { for (const v of vs) if (typeof v === "number" && Number.isFinite(v)) return v; return undefined; };
const PRIORITIES: Priority[] = ["low", "medium", "high", "critical"];
const toHealth = (h: unknown): HealthStatus => {
  const v = String(h ?? "").toLowerCase().replace(/_/g, "-");
  return v === "on-track" || v === "at-risk" || v === "delayed" || v === "completed" || v === "not-started" ? v : "on-track";
};
const person = (v: unknown) => {
  const p = obj(v);
  const name = str(p.name, p.fullName, p.email);
  return name ? { name, initials: str(p.initials) ?? initialsOf(name) } : null;
};

interface TaskDetail {
  title: string; description?: string; status?: string; priority: Priority; priorityLabel?: string;
  start?: string; due?: string; hours?: number; percent: number;
  health: HealthStatus; slipDays: number; tags: string[];
  assignee: { name: string; initials: string } | null; reviewer: { name: string; initials: string } | null;
  forecast: Obj; comments: { author: { name: string; initials: string } | null; body: string; at?: string }[];
  projectId?: string; projectTitle?: string;
  /** Ids and values the edit form starts from. */
  assigneeId: string | null; reviewerId: string | null; columnId?: string; actualHours?: number;
}

/** Maps the getTask response (the task itself, or `{ task, forecast, comments }`). */
function toDetail(data: unknown): TaskDetail {
  const d = obj(data);
  const task = { ...d, ...obj(d.task) };
  const plan = obj(task.plan);
  const progress = obj(task.progress);
  const project = obj(task.project);
  const pr = String(task.priority ?? task.priorityLabel ?? "").toLowerCase();
  const notStarted = progress.startedAt === null;
  const rawComments = Array.isArray(d.comments) ? d.comments : Array.isArray(task.comments) ? task.comments : [];
  return {
    title: str(task.title, task.name) ?? "—",
    description: str(task.description),
    status: str(task.status, obj(task.column).name, task.columnName),
    priority: (PRIORITIES as string[]).includes(pr) ? (pr as Priority) : "medium",
    priorityLabel: str(task.priorityLabel),
    start: str(plan.start, task.plannedStart), due: str(plan.due, task.plannedDue), hours: num(plan.hours, task.plannedHours),
    percent: Math.max(0, Math.min(100, Math.round(num(progress.percent, task.completionPct) ?? 0))),
    health: notStarted ? "not-started" : toHealth(task.health),
    slipDays: num(task.slipDays) ?? 0,
    tags: Array.isArray(task.tags) ? (task.tags as unknown[]).filter((x): x is string => typeof x === "string") : [],
    assignee: person(task.assignee), reviewer: person(task.reviewer),
    forecast: obj(d.forecast ?? task.forecast),
    comments: (rawComments as unknown[]).map((c) => {
      const co = obj(c);
      return { author: person(co.author ?? co.user ?? co.createdBy), body: str(co.body, co.text, co.comment, co.message) ?? "", at: str(co.createdAt, co.date) };
    }).filter((c) => c.body),
    projectId: str(task.projectId, project._id, project.id), projectTitle: str(project.title, task.projectTitle),
    assigneeId: str(task.assigneeId, obj(task.assignee)._id, obj(task.assignee).id) ?? null,
    reviewerId: str(task.reviewerId, obj(task.reviewer)._id, obj(task.reviewer).id) ?? null,
    columnId: str(task.columnId, obj(task.column)._id, obj(task.column).id),
    actualHours: num(progress.actualHours, task.actualHours),
  };
}

export function TaskDetailScreen({ taskId, projectId }: { taskId: string; projectId?: string }) {
  const { navigate } = useApp();
  const { t, locale } = useT();
  const label = useHealthLabel();
  const [data, setData] = useState<unknown>(null);
  const [error, setError] = useState<unknown>(null);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const can = useCan();
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (!saved) return; const id = setTimeout(() => setSaved(false), 2500); return () => clearTimeout(id); }, [saved]);

  useEffect(() => {
    const ctrl = new AbortController();
    setError(null);
    tasksApi.getTask(taskId, ctrl.signal)
      .then((res) => { console.log("[task] getTask", res); setData(res ?? {}); })
      .catch((err: unknown) => { if ((err as Error)?.name !== "AbortError") setError(err); });
    return () => ctrl.abort();
  }, [taskId, nonce]);

  const task = useMemo(() => (data ? toDetail(data) : null), [data]);
  const backTo = projectId ?? task?.projectId;
  const back = backTo && (
    <button type="button" onClick={() => navigate(`/projects/${backTo}`)} className="mb-2 inline-flex items-center gap-1 text-[13px] font-medium text-brand-600 hover:underline">
      <Icons.back className="h-4 w-4" />{task?.projectTitle ?? t("projects.title")}
    </button>
  );

  if (!task && !error) return <div className="animate-rise">{back}<Card><div className="flex items-center justify-center gap-2 py-10 text-[13px] text-ink-500"><Spinner className="h-5 w-5" />{t("tasks.boardLoading")}</div></Card></div>;
  if (!task) {
    return (
      <div className="animate-rise">{back}
        <Card>
          <div role="alert" className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="max-w-[48ch] text-[13px] text-ink-700">{(error instanceof ApiError && error.localized(locale)) || t("tasks.taskFailed")}</p>
            <Button variant="secondary" size="sm" onClick={reload}>{t("projects.retry")}</Button>
          </div>
        </Card>
      </div>
    );
  }

  // task.edit → every field; task.progress.update alone → progress only.
  const permProject = projectId ?? task.projectId;
  const canEditAll = can("task.edit", permProject);
  const canEditProgress = can("task.progress.update", permProject);
  // getTask's forecast uses long names; map them onto the tiles (short names still accepted).
  const raw = task.forecast;
  const f: Obj = {
    pwd: raw.plannedWorkingDays ?? raw.pwd,
    pv: raw.plannedVelocity ?? raw.pv,
    awde: raw.elapsedWorkingDays ?? raw.awde,
    wdav: raw.velocity ?? raw.wdav,
    rewd: raw.remainingWorkingDays ?? raw.rewd,
    fcd: raw.forecastDue ?? raw.fcd,
    wddv: raw.slipDays ?? raw.wddv,
  };
  const fmtMetric = (v: unknown) => (typeof v === "number" ? String(Math.round(v * 10) / 10) : typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? fmtDate(v, locale) : typeof v === "string" ? v : "—");
  const metrics = [
    { key: "pwd", label: t("tasks.pwd") }, { key: "pv", label: t("tasks.pv") }, { key: "awde", label: t("tasks.awde") },
    { key: "wdav", label: t("tasks.wdav") }, { key: "rewd", label: t("tasks.rewd") }, { key: "fcd", label: t("tasks.fcd") },
  ].filter((m) => f[m.key] != null);
  const wddv = num(f.wddv, task.slipDays);
  const late = (wddv ?? 0) > 0;

  return (
    <div className="animate-rise">
      {back}
      <PageHeader
        title={task.title}
        actions={<>
          {saved && <Pill tone="ok">{t("tasks.updated")}</Pill>}
          {(canEditAll || canEditProgress) && <Button variant="secondary" icon={<Icons.settings className="h-4 w-4" />} onClick={() => setEditing(true)}>{t("tasks.editTask")}</Button>}
        </>}
        subtitle={<span className="inline-flex flex-wrap items-center gap-2">
          {task.status && <Pill tone="brand">{task.status}</Pill>}
          <PriorityDot priority={task.priority} label={task.priorityLabel || t(`tasks.priority.${task.priority}`)} />
          {task.tags.map((g) => <Pill key={g}>#{g}</Pill>)}
        </span>}
      />

      {late && task.health === "delayed" && (
        <div role="alert" className="mb-4 flex items-start gap-3 rounded-lg border border-danger-600/25 bg-danger-50 px-4 py-3 text-[13px] text-danger-700">
          <Icons.warning className="mt-0.5 h-5 w-5 shrink-0" /><p>{t("tasks.alertBanner", { n: wddv ?? 0 })}</p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Card title={t("tasks.forecastPanel")} action={task.health !== "completed" ? <HealthBadge health={task.health} label={label[task.health]} /> : undefined}>
            {metrics.length === 0 && wddv == null ? <p className="text-[13px] text-ink-500">{t("tasks.noForecast")}</p> : (
              <>
                {metrics.length > 0 && (
                  <ol className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
                    {metrics.map((m, i) => (
                      <li key={m.key}>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{i + 1}. {m.label}</p>
                        <p className={cx("mt-0.5 text-[20px] font-semibold tabular-nums", m.key === "fcd" && late ? "text-danger-700" : "text-ink-900")}>{fmtMetric(f[m.key])}</p>
                      </li>
                    ))}
                  </ol>
                )}
                {wddv != null && (
                  <div className={cx("mt-5 flex items-center justify-between rounded-md px-4 py-3", late ? "bg-danger-50" : "bg-ok-50")}>
                    <span className="text-[13px] font-medium text-ink-900">{t("tasks.wddv")}</span>
                    <span className={cx("text-[20px] font-bold tabular-nums", late ? "text-danger-700" : "text-ok-700")}>{`${wddv > 0 ? "+" : ""}${wddv} ${t("common.workingDays")}`}</span>
                  </div>
                )}
              </>
            )}
          </Card>

          <Card title={t("tasks.completion")}>
            <div className="flex items-center gap-4">
              <div className="flex-1"><Progress value={task.percent} height={10} tone={task.health === "delayed" ? "danger" : task.health === "at-risk" ? "warn" : "brand"} /></div>
              <span className="w-14 text-end text-[22px] font-semibold tabular-nums text-ink-900">{task.percent}%</span>
            </div>
          </Card>

          <Card title={t("tasks.comment")} padded={false}>
            {task.comments.length === 0 ? <p className="px-4 py-6 text-center text-[13px] text-ink-500 sm:px-5">{t("tasks.noComments")}</p> : (
              <ul className="divide-y divide-line">
                {task.comments.map((c, i) => (
                  <li key={i} className="flex gap-3 px-4 py-3 sm:px-5">
                    <Avatar initials={c.author?.initials ?? "?"} name={c.author?.name ?? "—"} size={28} index={i} />
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-ink-900">{c.author?.name ?? "—"}{c.at && <span className="ms-2 text-[12px] font-normal text-ink-400">{fmtDate(c.at, locale)}</span>}</p>
                      <p className="text-[13px] text-ink-700">{c.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <dl className="space-y-3 text-[13px]">
              <Row k={t("tasks.assignee")}>{task.assignee ? <span className="inline-flex items-center gap-1.5"><Avatar initials={task.assignee.initials} name={task.assignee.name} size={22} />{task.assignee.name}</span> : "—"}</Row>
              <Row k={t("tasks.reviewer")}>{task.reviewer?.name ?? "—"}</Row>
              <Row k={t("tasks.plannedStart")}>{fmtDate(task.start, locale)}</Row>
              <Row k={t("tasks.plannedDue")}>{fmtDate(task.due, locale)}{task.slipDays > 0 && <span className="ms-1 font-semibold text-danger-700">+{task.slipDays}d</span>}</Row>
              {task.hours != null && <Row k={t("tasks.create.hours")}>{task.hours}h</Row>}
            </dl>
          </Card>
          {task.description && <Card title={t("tasks.create.description")}><p className="whitespace-pre-line text-[13px] leading-relaxed text-ink-700">{task.description}</p></Card>}
        </div>
      </div>

      {editing && (
        <EditTaskDialog taskId={taskId} projectId={permProject} task={task} progressOnly={!canEditAll}
          onClose={() => setEditing(false)}
          onSaved={(res) => { if (res) setData(res); else reload(); setEditing(false); setSaved(true); }} />
      )}
    </div>
  );
}

/* ─── Edit task (PATCH /admin/tasks/updateTask/:taskId) ───────────────────── */
function EditTaskDialog({ taskId, projectId, task, progressOnly, onClose, onSaved }: {
  taskId: string; projectId?: string; task: TaskDetail; progressOnly: boolean; onClose: () => void; onSaved: (task: unknown) => void;
}) {
  const { t, locale } = useT();
  const { users } = useApiUsers();
  const [columns, setColumns] = useState<BoardColumn[]>([]);
  const initial = useMemo(() => ({
    title: task.title === "—" ? "" : task.title,
    description: task.description ?? "",
    priority: task.priority as Priority,
    tags: task.tags.join(", "),
    start: task.start?.slice(0, 10) ?? "",
    due: task.due?.slice(0, 10) ?? "",
    hours: task.hours != null ? String(task.hours) : "",
    assigneeId: task.assigneeId ?? "",
    reviewerId: task.reviewerId ?? "",
    columnId: task.columnId ?? "",
    percent: task.percent,
    actualHours: task.actualHours != null ? String(task.actualHours) : "",
  }), [task]);
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<{ title?: string; due?: string; hours?: string; actualHours?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => { setForm((f) => ({ ...f, [k]: v })); setErrors({}); };

  // Columns for the status picker come from the project's board.
  useEffect(() => {
    if (!projectId || progressOnly) return;
    const ctrl = new AbortController();
    tasksApi.getBoard(projectId, ctrl.signal).then((b) => setColumns(Array.isArray(b?.columns) ? b.columns : [])).catch(() => { /* picker stays hidden */ });
    return () => ctrl.abort();
  }, [projectId, progressOnly]);

  /** Only the fields that changed (the API writes only those anyway). */
  const buildBody = (): UpdateTaskBody => {
    const b: UpdateTaskBody = {};
    if (!progressOnly) {
      if (form.title.trim() !== initial.title) b.title = form.title.trim();
      if (form.description.trim() !== initial.description.trim()) b.description = form.description.trim();
      if (form.priority !== initial.priority) b.priority = form.priority;
      const tags = form.tags.split(",").map((x) => x.trim()).filter(Boolean);
      if (tags.join(",") !== task.tags.join(",")) b.tags = tags;
      const plan: NonNullable<UpdateTaskBody["plan"]> = {};
      if (form.start !== initial.start) plan.start = form.start;
      if (form.due !== initial.due) plan.due = form.due;
      if (form.hours !== initial.hours && form.hours.trim() !== "") plan.hours = Number(form.hours);
      if (Object.keys(plan).length) b.plan = plan;
      if (form.assigneeId !== initial.assigneeId) b.assigneeId = form.assigneeId || null;
      if (form.reviewerId !== initial.reviewerId) b.reviewerId = form.reviewerId || null;
      if (form.columnId && form.columnId !== initial.columnId) b.columnId = form.columnId;
    }
    const progress: NonNullable<UpdateTaskBody["progress"]> = {};
    if (form.percent !== initial.percent) progress.percent = form.percent;
    if (form.actualHours !== initial.actualHours && form.actualHours.trim() !== "") progress.actualHours = Number(form.actualHours);
    if (Object.keys(progress).length) b.progress = progress;
    return b;
  };

  const submit = async () => {
    if (busy) return;
    const e: typeof errors = {};
    if (!progressOnly) {
      if (!form.title.trim()) e.title = t("tasks.create.required");
      if (form.start && form.due && form.due < form.start) e.due = t("tasks.create.dueBeforeStart");
      if (form.hours.trim() && !(Number(form.hours) >= 0)) e.hours = t("tasks.create.hoursInvalid");
    }
    if (form.actualHours.trim() && !(Number(form.actualHours) >= 0)) e.actualHours = t("tasks.create.hoursInvalid");
    if (Object.keys(e).length) { setErrors(e); return; }
    const body = buildBody();
    if (!Object.keys(body).length) { onClose(); return; } // nothing changed
    setBusy(true);
    try {
      const res = await tasksApi.updateTask(taskId, body);
      onSaved(res ?? null);
    } catch (err) {
      setErrors({ form: (err instanceof ApiError && err.localized(locale)) || t("tasks.updateFailed") });
      setBusy(false);
    }
  };

  const userOptions = users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>);
  return (
    <Modal open size="lg" title={t("tasks.editTask")} subtitle={task.title} onClose={() => { if (!busy) onClose(); }}
      actions={<><Button variant="secondary" onClick={onClose} disabled={busy}>{t("common.cancel")}</Button><Button onClick={submit} isLoading={busy} icon={<Icons.check className="h-4 w-4" />}>{t("common.save")}</Button></>}>
      <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="space-y-4">
        {errors.form && <p role="alert" className="flex items-start gap-2 rounded-md border border-danger-600/30 bg-danger-50 px-3 py-2.5 text-[13px] text-danger-700"><Icons.warning className="mt-0.5 h-4 w-4 shrink-0" />{errors.form}</p>}
        {!progressOnly && (
          <>
            <Input name="et-title" label={t("tasks.create.name")} value={form.title} maxLength={200} onChange={(e) => set("title", e.target.value)} error={errors.title} />
            <Field id="et-desc" label={t("tasks.create.description")} optional={t("newProject.optional")}>
              <TextArea id="et-desc" value={form.description} onChange={(v) => set("description", v)} rows={3} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="et-priority" label={t("tasks.create.priority")}>
                <Select id="et-priority" value={form.priority} onChange={(v) => set("priority", v as Priority)}>{PRIORITIES.map((p) => <option key={p} value={p}>{t(`tasks.priority.${p}`)}</option>)}</Select>
              </Field>
              {columns.length > 0 && (
                <Field id="et-column" label={t("tasks.create.status")}>
                  <Select id="et-column" value={form.columnId || columns[0]._id} onChange={(v) => set("columnId", v)}>{columns.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</Select>
                </Field>
              )}
              <Field id="et-assignee" label={t("tasks.create.assignee")}>
                <Select id="et-assignee" value={form.assigneeId} onChange={(v) => set("assigneeId", v)}><option value="">{t("tasks.create.unassigned")}</option>{userOptions}</Select>
              </Field>
              <Field id="et-reviewer" label={t("tasks.create.reviewer")}>
                <Select id="et-reviewer" value={form.reviewerId} onChange={(v) => set("reviewerId", v)}><option value="">{t("tasks.create.noReviewer")}</option>{userOptions}</Select>
              </Field>
              <Input name="et-start" type="date" label={t("tasks.create.start")} value={form.start} onChange={(e) => set("start", e.target.value)} />
              <Input name="et-due" type="date" label={t("tasks.create.due")} value={form.due} min={form.start || undefined} onChange={(e) => set("due", e.target.value)} error={errors.due} />
              <Input name="et-hours" type="number" min={0} step={1} inputMode="numeric" label={t("tasks.create.hours")} value={form.hours} onChange={(e) => set("hours", e.target.value)} error={errors.hours} />
              <Input name="et-tags" label={t("tasks.create.tags")} placeholder={t("tasks.create.tagsPh")} value={form.tags} maxLength={200} onChange={(e) => set("tags", e.target.value)} />
            </div>
          </>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="et-percent" label={`${t("tasks.completion")} · ${form.percent}%`} hint={form.percent === 100 ? t("tasks.doneHint") : undefined}>
            <input id="et-percent" type="range" min={0} max={100} step={5} value={form.percent} onChange={(e) => set("percent", Number(e.target.value))} className="h-10 w-full accent-brand-600" aria-valuetext={`${form.percent}%`} />
          </Field>
          <Input name="et-actual" type="number" min={0} step={0.5} inputMode="decimal" label={t("tasks.actualHours")} value={form.actualHours} onChange={(e) => set("actualHours", e.target.value)} error={errors.actualHours} />
        </div>
        <button type="submit" hidden aria-hidden />
      </form>
    </Modal>
  );
}

function Row({ k, children }: { k: string; children: ReactNode }) {
  return <div className="flex items-start justify-between gap-3"><dt className="shrink-0 text-ink-500">{k}</dt><dd className="flex flex-wrap justify-end gap-2 text-end font-medium text-ink-900">{children}</dd></div>;
}
