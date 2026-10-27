"use client";
import { useCallback, useEffect, useState, type DragEvent, type FormEvent } from "react";
import { ApiError, tasksApi, type BoardColumn, type BoardData, type BoardTask } from "@ptp/api";
import type { HealthStatus } from "@ptp/forecast";
import { useApp, useCan, useT } from "../context";
import { fmtDate, fmtMoney } from "../data";
import type { Priority } from "../models";
import { Button, Card, Field, HealthBadge, Icons, Input, Modal, PageHeader, PriorityDot, Progress, Select, Spinner, cx } from "../primitives";
import { useHealthLabel } from "./projects";

/**
 * One project's task board, bound to the backend:
 * GET getBoard (header + columns), PATCH moveTask (drag), GET getTasks (List tab), POST createTask (New task).
 */
const PRIORITIES: Priority[] = ["low", "medium", "high", "critical"];
const taskId = (task: BoardTask) => task._id;

/** Backend health (on_track, at_risk…) → UI health; a task that hasn't started shows "To do". */
function cardHealth(task: BoardTask): HealthStatus {
  if (task.progress?.startedAt === null) return "not-started";
  return toHealth(task.health);
}
function toHealth(h: string | undefined): HealthStatus {
  const v = String(h ?? "").toLowerCase().replace(/_/g, "-");
  return v === "on-track" || v === "at-risk" || v === "delayed" || v === "completed" || v === "not-started" ? v : "on-track";
}
function toPriority(task: BoardTask): Priority {
  const v = String(task.priority ?? task.priorityLabel ?? "").toLowerCase();
  return (PRIORITIES as string[]).includes(v) ? (v as Priority) : "medium";
}
const errorText = (err: unknown, locale: "en" | "ar", fallback: string) => (err instanceof ApiError && err.localized(locale)) || fallback;

export function ProjectBoardScreen({ projectId }: { projectId: string }) {
  const { navigate, today } = useApp();
  const { t, locale } = useT();
  const can = useCan();
  const label = useHealthLabel();
  const [board, setBoard] = useState<BoardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const [view, setView] = useState<"board" | "list">("board");
  const [creating, setCreating] = useState(false);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    tasksApi.getBoard(projectId, ctrl.signal)
      .then((data) => { console.log("[board] getBoard response", data); setBoard({ project: data?.project ?? { title: "" }, columns: Array.isArray(data?.columns) ? data.columns : [] }); })
      .catch((err: unknown) => { if ((err as Error)?.name !== "AbortError") setError(err); })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
    return () => ctrl.abort();
  }, [projectId, nonce]);

  const openTask = (task: BoardTask) => navigate(`/projects/${projectId}/tasks/${taskId(task)}`);
  const p = board?.project;
  const health = toHealth(p?.health);

  return (
    <div className="animate-rise">
      <button type="button" onClick={() => navigate("/projects")} className="mb-2 inline-flex items-center gap-1 text-[13px] font-medium text-brand-600 hover:underline"><Icons.back className="h-4 w-4" />{t("projects.title")}</button>
      <PageHeader
        title={p?.title || (loading ? t("tasks.boardLoading") : t("tasks.title"))}
        subtitle={p && (
          <span className="inline-flex flex-wrap items-center gap-2">
            <HealthBadge size="sm" health={health} label={label[health]} />
            <span>{[p.calendar?.label, p.plannedDue && `${t("projects.due")} ${fmtDate(p.plannedDue.slice(0, 10), locale)}`, typeof p.budget === "number" && `${t("projects.budget")} ${fmtMoney(p.budget, locale, p.currency ?? "USD")}`].filter(Boolean).join(" · ")}</span>
          </span>
        )}
        actions={
          <>
            <div role="tablist" className="inline-flex rounded-md border border-line bg-surface p-0.5">
              {(["board", "list"] as const).map((v) => (
                <button key={v} role="tab" aria-selected={view === v} type="button" onClick={() => setView(v)} className={cx("h-8 rounded px-3 text-[13px] font-medium", view === v ? "bg-brand-50 text-brand-700" : "text-ink-500 hover:text-ink-900")}>{t(`tasks.${v}`)}</button>
              ))}
            </div>
            {can("task.create", projectId) && board && <Button icon={<Icons.plus className="h-4 w-4" />} onClick={() => setCreating(true)}>{t("tasks.newTask")}</Button>}
          </>
        }
      />

      {notice && (
        <div role="status" className={cx("mb-4 flex items-center gap-2 rounded-lg border px-4 py-2.5 text-[13px]", notice.tone === "ok" ? "border-ok-600/25 bg-ok-50 text-ok-700" : "border-warn-600/25 bg-warn-50 text-warn-700")}>
          {notice.tone === "ok" ? <Icons.check className="h-4 w-4" /> : <Icons.warning className="h-4 w-4" />}{notice.text}
          <button type="button" onClick={() => setNotice(null)} aria-label={t("common.cancel")} className="ms-auto opacity-70 hover:opacity-100"><Icons.x className="h-4 w-4" /></button>
        </div>
      )}

      {loading && !board ? (
        <Card><div className="flex items-center justify-center gap-2 py-10 text-[13px] text-ink-500"><Spinner className="h-5 w-5" />{t("tasks.boardLoading")}</div></Card>
      ) : error && !board ? (
        <Card>
          <div role="alert" className="flex flex-col items-center gap-3 py-8 text-center">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-danger-50 text-danger-700"><Icons.warning className="h-5 w-5" /></span>
            <p className="max-w-[48ch] text-[13px] text-ink-700">{errorText(error, locale, t("tasks.boardFailed"))}</p>
            <Button variant="secondary" size="sm" onClick={reload}>{t("projects.retry")}</Button>
          </div>
        </Card>
      ) : board && view === "board" ? (
        <ApiBoard board={board} setBoard={setBoard} onOpen={openTask}
          onMoveError={(err) => { setNotice({ tone: "warn", text: err instanceof ApiError && err.status === 409 ? t("tasks.moveConflict") : errorText(err, locale, t("tasks.moveFailed")) }); reload(); }} />
      ) : board ? (
        <TaskList projectId={projectId} onOpen={openTask} />
      ) : null}

      {board && (
        <NewApiTaskDialog open={creating} projectId={projectId} columns={board.columns} today={today}
          onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); setNotice({ tone: "ok", text: t("tasks.create.created") }); reload(); }} />
      )}
    </div>
  );
}

/* ─── Board with server-side drag and drop ───────────────────────────────── */
function ApiBoard({ board, setBoard, onOpen, onMoveError }: {
  board: BoardData; setBoard: (b: BoardData) => void; onOpen: (task: BoardTask) => void; onMoveError: (err: unknown) => void;
}) {
  const { t } = useT();
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<{ column: string; before: string | null } | null>(null);

  /** Drop `id` into `columnId` right before card `beforeCardId` (null = end of column). */
  const drop = (columnId: string, beforeCardId: string | null) => {
    const id = dragging;
    setDragging(null); setOver(null);
    if (!id) return;
    const from = board.columns.find((c) => c.tasks.some((x) => taskId(x) === id));
    const task = from?.tasks.find((x) => taskId(x) === id);
    if (!from || !task || beforeCardId === id) return;

    // Optimistic: move locally, then confirm with the server.
    const columns: BoardColumn[] = board.columns.map((c) => ({ ...c, tasks: c.tasks.filter((x) => taskId(x) !== id) }));
    const target = columns.find((c) => c._id === columnId);
    if (!target) return;
    const at = beforeCardId ? target.tasks.findIndex((x) => taskId(x) === beforeCardId) : -1;
    const index = at === -1 ? target.tasks.length : at;
    const unchanged = from._id === columnId && from.tasks.findIndex((x) => taskId(x) === id) === index;
    if (unchanged) return;
    target.tasks.splice(index, 0, task);
    if (from._id !== columnId) {
      for (const c of columns) {
        if (c._id === from._id && typeof c.count === "number") c.count -= 1;
        if (c._id === columnId && typeof c.count === "number") c.count += 1;
      }
    }
    const previous = board;
    setBoard({ ...board, columns });

    const above = index > 0 ? taskId(target.tasks[index - 1]) : null;
    const below = index < target.tasks.length - 1 ? taskId(target.tasks[index + 1]) : null;
    const atEnd = below === null;
    tasksApi.moveTask(id, { columnId, ...(atEnd ? {} : { beforeId: above, afterId: below }), version: task.version })
      .then((updated) => {
        if (!updated || !taskId(updated)) return;
        setBoard({ ...previous, columns: columns.map((c) => ({ ...c, tasks: c.tasks.map((x) => (taskId(x) === id ? { ...x, ...updated } : x)) })) });
      })
      .catch((err: unknown) => { setBoard(previous); onMoveError(err); });
  };

  const onColumnDragOver = (column: string) => (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.dataTransfer.dropEffect = "move";
    if (e.target === e.currentTarget && (over?.column !== column || over.before !== null)) setOver({ column, before: null });
  };

  return (
    <>
      <div className="scroll-x -mx-4 px-4 pb-2 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex items-start gap-3" style={{ minWidth: board.columns.length * 272 }}>
          {board.columns.map((c) => {
            const active = !!dragging && over?.column === c._id;
            return (
              <section key={c._id} className="w-[260px] shrink-0" aria-label={c.name}>
                <header className="mb-2 flex items-center gap-1 px-1">
                  <h3 className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink-700">{c.name}</h3>
                  <span className="rounded-full bg-slate-100 px-2 text-[12px] tabular-nums text-ink-500">{c.count ?? c.tasks.length}</span>
                </header>
                <div
                  onDragOver={onColumnDragOver(c._id)}
                  onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver((o) => (o?.column === c._id ? null : o)); }}
                  onDrop={(e) => { e.preventDefault(); drop(c._id, over?.column === c._id ? over.before : null); }}
                  className={cx("min-h-[120px] space-y-2 rounded-lg p-2 transition-colors", active ? "bg-brand-50 ring-2 ring-brand-600/30" : "bg-slate-100/70")}
                >
                  {c.tasks.map((task) => {
                    const id = taskId(task);
                    return (
                      <div key={id} draggable
                        onDragStart={(e) => { e.dataTransfer.setData("text/plain", id); e.dataTransfer.effectAllowed = "move"; setDragging(id); }}
                        onDragEnd={() => { setDragging(null); setOver(null); }}
                        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); if (over?.column !== c._id || over.before !== id) setOver({ column: c._id, before: id }); }}
                        className={cx("cursor-grab active:cursor-grabbing", dragging === id && "opacity-40", active && over?.before === id && dragging !== id && "border-t-2 border-brand-600 pt-1")}>
                        <ApiTaskCard task={task} onOpen={() => onOpen(task)} />
                      </div>
                    );
                  })}
                  {c.tasks.length === 0 && <p className="py-8 text-center text-[12px] text-ink-400">{t("tasks.emptyColumn")}</p>}
                </div>
              </section>
            );
          })}
        </div>
      </div>
      <p className="mt-1 text-[12px] text-ink-500">{board.columns.length ? t("tasks.dropHint") : t("tasks.noTasks")}</p>
    </>
  );
}

function ApiTaskCard({ task, onOpen }: { task: BoardTask; onOpen: () => void }) {
  const { t, locale } = useT();
  const label = useHealthLabel();
  const health = cardHealth(task);
  const percent = Math.max(0, Math.min(100, Math.round(task.progress?.percent ?? 0)));
  const priority = toPriority(task);
  return (
    <button type="button" onClick={onOpen} className="w-full rounded-md border border-line bg-surface p-3 text-start shadow-[0_1px_2px_rgb(15_23_42/0.04)] transition-[transform,box-shadow] duration-150 hover:-translate-y-px hover:shadow-card active:scale-[0.99]">
      <p className="font-medium leading-snug text-ink-900">{task.title}</p>
      <div className="mt-2"><PriorityDot priority={priority} label={task.priorityLabel || t(`tasks.priority.${priority}`)} /></div>
      <div className="mt-2.5 flex items-center gap-2"><Progress value={percent} height={4} tone={health === "delayed" ? "danger" : health === "at-risk" ? "warn" : "brand"} /><span className="text-[11px] tabular-nums text-ink-500">{percent}%</span></div>
      <div className="mt-2.5 flex items-center justify-between">
        <span className="whitespace-nowrap text-[12px] text-ink-500">
          {fmtDate(task.plan?.due?.slice(0, 10) ?? null, locale)}
          {(task.slipDays ?? 0) > 0 && <span className="ms-1 font-semibold tabular-nums text-danger-700">+{task.slipDays}d</span>}
        </span>
        <div className="flex items-center gap-1.5">
          {health !== "completed" && <HealthBadge size="sm" health={health} label={label[health]} />}
          {task.assignee?.initials && <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-[10px] font-semibold text-brand-700" title={task.assignee.name}>{task.assignee.initials}</span>}
        </div>
      </div>
    </button>
  );
}

/* ─── List tab (GET getTasks) ────────────────────────────────────────────── */
function TaskList({ projectId, onOpen }: { projectId: string; onOpen: (task: BoardTask) => void }) {
  const { t, locale } = useT();
  const label = useHealthLabel();
  const [tasks, setTasks] = useState<BoardTask[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setTasks(null); setError(null);
    tasksApi.getTasks(projectId, {}, ctrl.signal)
      .then((data) => setTasks(Array.isArray(data) ? data : []))
      .catch((err: unknown) => { if ((err as Error)?.name !== "AbortError") setError(err); });
    return () => ctrl.abort();
  }, [projectId]);

  if (error) return <Card><p role="alert" className="py-6 text-center text-[13px] text-danger-700">{errorText(error, locale, t("tasks.boardFailed"))}</p></Card>;
  if (!tasks) return <Card><div className="flex items-center justify-center gap-2 py-10 text-[13px] text-ink-500"><Spinner className="h-5 w-5" />{t("tasks.boardLoading")}</div></Card>;
  if (!tasks.length) return <Card><p className="py-6 text-center text-[13px] text-ink-500">{t("tasks.noTasks")}</p></Card>;
  return (
    <Card padded={false}>
      <ul className="divide-y divide-line">
        {tasks.map((task) => {
          const health = cardHealth(task);
          const percent = Math.round(task.progress?.percent ?? 0);
          const priority = toPriority(task);
          return (
            <li key={taskId(task)}>
              <button type="button" onClick={() => onOpen(task)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-start transition-colors hover:bg-slate-50 sm:px-5">
                <span className="min-w-0 flex-1 basis-48 font-medium text-ink-900">{task.title}</span>
                <PriorityDot priority={priority} label={task.priorityLabel || t(`tasks.priority.${priority}`)} />
                <span className="flex w-28 items-center gap-2"><Progress value={percent} height={4} /><span className="text-[11px] tabular-nums text-ink-500">{percent}%</span></span>
                <span className="w-24 whitespace-nowrap text-[12px] text-ink-500">{fmtDate(task.plan?.due?.slice(0, 10) ?? null, locale)}{(task.slipDays ?? 0) > 0 && <span className="ms-1 font-semibold text-danger-700">+{task.slipDays}d</span>}</span>
                {health !== "completed" && <HealthBadge size="sm" health={health} label={label[health]} />}
                {task.assignee?.initials && <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-[10px] font-semibold text-brand-700" title={task.assignee.name}>{task.assignee.initials}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/* ─── New task (POST createTask) ─────────────────────────────────────────── */
function NewApiTaskDialog({ open, projectId, columns, today, onClose, onCreated }: {
  open: boolean; projectId: string; columns: BoardColumn[]; today: string; onClose: () => void; onCreated: () => void;
}) {
  const { t, locale } = useT();
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [start, setStart] = useState(today);
  const [due, setDue] = useState(today);
  const [hours, setHours] = useState("8");
  const [tags, setTags] = useState("");
  const [columnId, setColumnId] = useState("");
  const [errors, setErrors] = useState<{ title?: string; due?: string; hours?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);

  const reset = () => { setTitle(""); setPriority("medium"); setStart(today); setDue(today); setHours("8"); setTags(""); setColumnId(""); setErrors({}); setBusy(false); };
  const close = () => { reset(); onClose(); };

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const next: typeof errors = {};
    if (!title.trim()) next.title = t("tasks.create.required");
    if (!start || !due) next.due = t("tasks.create.required");
    else if (due < start) next.due = t("tasks.create.dueBeforeStart");
    const h = Number(hours);
    if (hours.trim() && (!Number.isFinite(h) || h <= 0)) next.hours = t("tasks.create.hoursInvalid");
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await tasksApi.createTask(projectId, {
        title: title.trim(), priority,
        tags: tags.split(",").map((x) => x.trim()).filter(Boolean),
        plan: { start, due, ...(hours.trim() ? { hours: h } : {}) },
        assigneeId: null,
        ...(columnId ? { columnId } : {}),
      });
      reset();
      onCreated();
    } catch (err) {
      setErrors({ form: errorText(err, locale, t("newProject.createFailed")) });
      setBusy(false);
    }
  }

  return (
    <Modal open={open} size="lg" title={t("tasks.create.title")} onClose={close}
      actions={<><Button variant="secondary" onClick={close} disabled={busy}>{t("common.cancel")}</Button><Button onClick={() => submit()} isLoading={busy} icon={<Icons.plus className="h-4 w-4" />}>{t("tasks.create.submit")}</Button></>}>
      <form onSubmit={submit} className="space-y-4">
        {errors.form && <p role="alert" className="flex items-start gap-2 rounded-md border border-danger-600/30 bg-danger-50 px-3 py-2.5 text-[13px] text-danger-700"><Icons.warning className="mt-0.5 h-4 w-4 shrink-0" />{errors.form}</p>}
        <Input name="nt-title" label={t("tasks.create.name")} placeholder={t("tasks.create.namePh")} value={title} maxLength={120} autoFocus
          onChange={(e) => { setTitle(e.target.value); setErrors((x) => ({ ...x, title: undefined })); }} error={errors.title} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="nt-priority" label={t("tasks.create.priority")}>
            <Select id="nt-priority" value={priority} onChange={(v) => setPriority(v as Priority)}>{PRIORITIES.map((p) => <option key={p} value={p}>{t(`tasks.priority.${p}`)}</option>)}</Select>
          </Field>
          <Field id="nt-column" label={t("tasks.create.status")}>
            {/* Untouched → columnId is omitted and the server uses Backlog. */}
            <Select id="nt-column" value={columnId || columns[0]?._id || ""} onChange={setColumnId}>
              {columns.length === 0 && <option value="">{t("tasks.backlog")}</option>}
              {columns.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
            </Select>
          </Field>
          <Input name="nt-start" type="date" label={t("tasks.create.start")} value={start} onChange={(e) => { setStart(e.target.value); setErrors((x) => ({ ...x, due: undefined })); }} />
          <Input name="nt-due" type="date" label={t("tasks.create.due")} value={due} min={start || undefined} onChange={(e) => { setDue(e.target.value); setErrors((x) => ({ ...x, due: undefined })); }} error={errors.due} />
          <Input name="nt-hours" type="number" min={1} step={1} inputMode="numeric" label={t("tasks.create.hours")} value={hours} onChange={(e) => { setHours(e.target.value); setErrors((x) => ({ ...x, hours: undefined })); }} error={errors.hours} />
          <Input name="nt-tags" label={t("tasks.create.tags")} placeholder={t("tasks.create.tagsPh")} value={tags} maxLength={120} onChange={(e) => setTags(e.target.value)} />
        </div>
        <button type="submit" hidden aria-hidden />
      </form>
    </Modal>
  );
}
