"use client";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ApiError, projectsApi } from "@ptp/api";
import { countWorkingDays, type Weekday } from "@ptp/forecast";
import { PROJECT_ROLES, type ProjectRole } from "@ptp/rbac";
import { useApiUsers, type UserOption } from "../api-users";
import { useApp, useSession, useT, type TKey } from "../context";
import { fmtDate, fmtMoney, fmtWeekday, fmtWeekdays } from "../data";
import { BACKLOG_TYPES, CALENDARS, WEEKDAYS, calendarIdFor, makeProjectCost, type BacklogItem, type BacklogType, type Level, type Milestone, type MoSCoW, type Priority, type ProjectCost, type ReportingCadence, type Risk, type RiskResponse, type Scenario, type Stakeholder } from "../models";
import { canCreateProjects } from "./projects";
import { AddUserDialog } from "./team";
import { Avatar, Button, Card, Field, Icons, Input, PageHeader, Pill, PriorityDot, Select, TextArea, controlCls, cx } from "../primitives";

/**
 * New project wizard — a PMI-style project charter. Steps follow the PMBOK knowledge areas a
 * project manager fills in at initiation: integration/charter, scope, schedule & cost,
 * resources/communications/stakeholders, and risk. Everything past the basics is optional.
 */
const STEPS = ["charter", "scope", "schedule", "cost", "team", "backlog", "risks"] as const;
type Step = (typeof STEPS)[number];
const LEVELS: Level[] = ["low", "medium", "high"];
const PRIORITIES: Priority[] = ["low", "medium", "high", "critical"];
const MOSCOW: MoSCoW[] = ["must", "should", "could", "wont"];
const POINTS = [1, 2, 3, 5, 8, 13, 21];
const TYPE_PH: Record<BacklogType, TKey> = { deliverable: "newProject.backlog.deliverablePh", requirement: "newProject.backlog.requirementPh", task: "newProject.backlog.taskPh", issue: "newProject.backlog.issuePh", research: "newProject.backlog.researchPh", procurement: "newProject.backlog.procurementPh", approval: "newProject.backlog.approvalPh" };
const typeTone = (ty: BacklogType): "danger" | "brand" | "warn" | "neutral" => (ty === "issue" ? "danger" : ty === "deliverable" ? "brand" : ty === "approval" ? "warn" : "neutral");
const newItemId = () => `b_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const CADENCES: ReportingCadence[] = ["daily", "weekly", "biweekly", "monthly"];
const RESPONSES: RiskResponse[] = ["avoid", "mitigate", "transfer", "accept"];
const CURRENCIES = ["USD", "EUR", "GBP", "SAR", "AED"];
const LEVEL_SCORE: Record<Level, number> = { low: 1, medium: 2, high: 3 };

interface Draft {
  title: string; code: string; category: string; description: string; sponsorId: string; ownerId: string; priority: Priority;
  objectives: string[]; deliverables: string[]; inScope: string; outOfScope: string; successCriteria: string; assumptions: string[]; constraints: string[];
  plannedStart: string; plannedDue: string; workingDays: Weekday[]; milestones: Milestone[]; budget: string; currency: string; contingencyPct: string;
  members: Record<string, ProjectRole>; stakeholders: Stakeholder[]; reportingCadence: ReportingCadence; channel: string;
  backlog: BacklogItem[];
  risks: Risk[];
}
type Errors = Partial<Record<string, string>>;

/** Everything the wizard collected, grouped by step — the shape to send to the backend's create-project endpoint. */
export interface NewProjectPayload {
  project: { title: string; code: string | null; category: string; description: string | null; ownerId: string; sponsorId: string | null; priority: Priority };
  scope: { objectives: string[]; deliverables: string[]; inScope: string | null; outOfScope: string | null; successCriteria: string | null; assumptions: string[]; constraints: string[] };
  schedule: { plannedStart: string; plannedDue: string; workingDays: Weekday[]; calendarId: string; plannedWorkingDays: number | null; milestones: Milestone[] };
  cost: ProjectCost;
  team: { members: { userId: string; role: ProjectRole }[]; stakeholders: Stakeholder[]; reportingCadence: ReportingCadence; channel: string | null };
  backlog: BacklogItem[];
  risks: Risk[];
  createdAt: string;
}

/** Normalizes the draft (trimmed text, empty → null, sorted dates/days, empty scenarios dropped) into one object. */
export function buildProjectPayload(d: Draft, today: string): NewProjectPayload {
  const text = (s: string) => s.trim() || null;
  const workingDays = [...d.workingDays].sort((a, b) => a - b);
  const members = { ...d.members, [d.ownerId]: "owner" as ProjectRole };
  return {
    project: { title: d.title.trim(), code: text(d.code), category: d.category.trim(), description: text(d.description), ownerId: d.ownerId, sponsorId: d.sponsorId || null, priority: d.priority },
    scope: { objectives: d.objectives, deliverables: d.deliverables, inScope: text(d.inScope), outOfScope: text(d.outOfScope), successCriteria: text(d.successCriteria), assumptions: d.assumptions, constraints: d.constraints },
    schedule: {
      plannedStart: d.plannedStart, plannedDue: d.plannedDue, workingDays, calendarId: calendarIdFor(workingDays),
      plannedWorkingDays: d.plannedStart && d.plannedDue > d.plannedStart && workingDays.length ? countWorkingDays(d.plannedStart, d.plannedDue, { ...CALENDARS["sun-thu"], id: "draft", workingDays }) : null,
      milestones: [...d.milestones].sort((a, b) => a.date.localeCompare(b.date)),
    },
    cost: makeProjectCost(Number(d.budget), d.currency, Number(d.contingencyPct)),
    team: { members: Object.entries(members).map(([userId, role]) => ({ userId, role })), stakeholders: d.stakeholders, reportingCadence: d.reportingCadence, channel: text(d.channel) },
    backlog: d.backlog.map((b) => ({
      ...b, title: b.title.trim(), description: b.description?.trim() || undefined,
      scenarios: b.scenarios.filter((s) => s.title.trim() || s.given.trim() || s.when.trim() || s.then.trim()),
    })),
    risks: d.risks,
    createdAt: today,
  };
}

/** Users from the API, shared with the wizard's sub-components (backlog editor, review). */
const UsersContext = createContext<UserOption[]>([]);
/** Display name for a user id ("—" when the id isn't in the loaded list). */
function useNameOf() {
  const users = useContext(UsersContext);
  return (id: string) => users.find((u) => u.id === id)?.name ?? "—";
}

const addDays = (iso: string, n: number) => { const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };

function initialDraft(ownerId: string, today: string): Draft {
  return {
    title: "", code: "", category: "", description: "", sponsorId: "", ownerId, priority: "medium",
    objectives: [], deliverables: [], inScope: "", outOfScope: "", successCriteria: "", assumptions: [], constraints: [],
    plannedStart: today, plannedDue: addDays(today, 90), workingDays: [...CALENDARS["sun-thu"].workingDays], milestones: [], budget: "", currency: "USD", contingencyPct: "10",
    members: { [ownerId]: "owner" }, stakeholders: [], reportingCadence: "weekly", channel: "",
    backlog: [],
    risks: [],
  };
}

export function NewProjectScreen() {
  const { today, navigate } = useApp();
  const { t, locale } = useT();
  const session = useSession();
  // Owner, sponsor, team and assignee pickers list the users from GET /admin/users/getAllUsers.
  const { users: USERS, reload: reloadUsers } = useApiUsers();
  const canCreate = canCreateProjects(session.principal);
  // "Create new user" on the team step: POST createUser (shared Add user dialog), reload the list, then add them to the team.
  const [creatingUser, setCreatingUser] = useState(false);
  const [pendingMember, setPendingMember] = useState<{ id: string; email: string; role: ProjectRole } | null>(null);
  useEffect(() => {
    if (!pendingMember) return;
    const u = USERS.find((x) => x.id === pendingMember.id || x.email.toLowerCase() === pendingMember.email);
    if (!u) return;
    setDraft((d) => (u.id === d.ownerId ? d : { ...d, members: { ...d.members, [u.id]: pendingMember.role } }));
    setPendingMember(null);
  }, [USERS, pendingMember]);

  const [step, setStep] = useState<Step>("charter");
  const [reached, setReached] = useState(0);
  const [draft, setDraft] = useState<Draft>(() => initialDraft(session.user.id, today));
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const patch = (p: Partial<Draft>) => { setDraft((d) => ({ ...d, ...p })); if (Object.keys(errors).length) setErrors({}); };
  const idx = STEPS.indexOf(step);

  const validate = (s: Step, d: Draft): Errors => {
    const e: Errors = {};
    const req = t("newProject.required");
    if (s === "charter") {
      if (!d.title.trim()) e.title = req;
      if (!d.category.trim()) e.category = req;
      if (!d.ownerId) e.ownerId = req;
    }
    if (s === "schedule") {
      if (!d.plannedStart) e.plannedStart = req;
      if (!d.plannedDue) e.plannedDue = req;
      else if (d.plannedStart && d.plannedDue <= d.plannedStart) e.plannedDue = t("newProject.dueBeforeStart");
      if (d.workingDays.length === 0) e.workingDays = t("newProject.pickDays");
      if (d.milestones.some((m) => !m.title.trim() || !m.date)) e.milestones = t("newProject.rowIncomplete");
      else if (d.milestones.some((m) => m.date < d.plannedStart || m.date > d.plannedDue)) e.milestones = t("newProject.milestoneOutOfRange");
    }
    if (s === "cost") {
      const b = Number(d.budget);
      if (d.budget.trim() === "" || Number.isNaN(b) || b < 0) e.budget = t("newProject.budgetInvalid");
      const pct = Number(d.contingencyPct);
      if (d.contingencyPct.trim() === "" || Number.isNaN(pct) || pct < 0 || pct > 100) e.contingencyPct = t("newProject.pctInvalid");
    }
    if (s === "team" && d.stakeholders.some((x) => !x.name.trim())) e.stakeholders = t("newProject.rowIncomplete");
    if (s === "backlog" && d.backlog.some((b) => !b.title.trim())) e.backlog = t("newProject.backlog.itemRequired");
    if (s === "risks" && d.risks.some((r) => !r.title.trim())) e.risks = t("newProject.rowIncomplete");
    return e;
  };

  const goTo = (s: Step) => { setStep(s); setErrors({}); window.scrollTo({ top: 0 }); };
  const next = () => {
    const e = validate(step, draft);
    if (Object.keys(e).length) { setErrors(e); return; }
    setReached((r) => Math.max(r, idx + 1));
    goTo(STEPS[idx + 1]);
  };
  const back = () => goTo(STEPS[idx - 1]);

  const create = async () => {
    if (submitting) return;
    for (const s of STEPS) {
      const e = validate(s, draft);
      if (Object.keys(e).length) { setStep(s); setErrors(e); return; }
    }
    // One object with every step's data, sent as-is to the backend (bearer token added by @ptp/api).
    const payload = buildProjectPayload(draft, today);
    console.log("[new project] payload", payload);
    setSubmitError(null);
    setSubmitting(true);
    try {
      await projectsApi.createProject(payload);
    } catch (err) {
      setSubmitError((err instanceof ApiError && err.localized(locale)) || t("newProject.createFailed"));
      setSubmitting(false);
      return;
    }
    navigate("/projects"); // back to the list, which reloads from the API and shows the new project
  };

  if (!canCreate) {
    return (
      <div className="animate-rise">
        <PageHeader title={t("newProject.title")} />
        <Card><p className="text-ink-700">{t("newProject.noAccess")}</p></Card>
      </div>
    );
  }

  const workingDays = draft.plannedStart && draft.plannedDue && draft.plannedDue > draft.plannedStart && draft.workingDays.length
    ? countWorkingDays(draft.plannedStart, draft.plannedDue, { ...CALENDARS["sun-thu"], id: "draft", workingDays: draft.workingDays }) : null;
  const toggleDay = (d: Weekday) => patch({ workingDays: draft.workingDays.includes(d) ? draft.workingDays.filter((x) => x !== d) : [...draft.workingDays, d].sort((a, b) => a - b) });
  const costPreview = makeProjectCost(Number(draft.budget) || 0, draft.currency, Number(draft.contingencyPct) || 0);

  return (
    <UsersContext.Provider value={USERS}>
    <div className="animate-rise">
      <button type="button" onClick={() => navigate("/projects")} className="mb-2 inline-flex items-center gap-1 text-[13px] font-medium text-brand-600 hover:underline"><Icons.back className="h-4 w-4" />{t("projects.title")}</button>
      <PageHeader title={t("newProject.title")} subtitle={t("newProject.subtitle")} />

      {/* Stepper */}
      <ol className="mb-5 flex flex-wrap gap-2" aria-label={t("newProject.stepOf", { n: idx + 1, total: STEPS.length })}>
        {STEPS.map((s, i) => {
          const state = i === idx ? "current" : i <= reached ? "done" : "todo";
          return (
            <li key={s}>
              <button type="button" disabled={i > reached} onClick={() => goTo(s)} aria-current={state === "current" ? "step" : undefined}
                className={cx("inline-flex h-8 items-center gap-2 rounded-full border px-3 text-[13px] font-medium transition-colors",
                  state === "current" ? "border-brand-600 bg-brand-50 text-brand-700" : state === "done" ? "border-line bg-surface text-ink-700 hover:border-brand-600" : "border-line bg-surface text-ink-400")}>
                <span className={cx("inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold", state === "current" ? "bg-accent text-white" : state === "done" ? "bg-ok-50 text-ok-700" : "bg-slate-100 text-ink-500")}>
                  {state === "done" ? <Icons.check className="h-3 w-3" /> : i + 1}
                </span>
                {t(`newProject.steps.${s}`)}
              </button>
            </li>
          );
        })}
      </ol>

      <Card>
        {step === "charter" && (
          <div className="grid gap-5 md:grid-cols-2">
            <div className="md:col-span-2"><Input name="title" label={t("newProject.name")} placeholder={t("newProject.namePh")} value={draft.title} onChange={(e) => patch({ title: e.target.value })} error={errors.title} maxLength={80} autoFocus /></div>
            <Input name="code" label={`${t("newProject.code")} (${t("newProject.optional")})`} placeholder={t("newProject.codePh")} value={draft.code} onChange={(e) => patch({ code: e.target.value })} maxLength={20} />
            <Input name="category" label={t("newProject.category")} placeholder={t("newProject.categoryPh")} value={draft.category} onChange={(e) => patch({ category: e.target.value })} error={errors.category} maxLength={40} />
            <div className="md:col-span-2">
              <Field id="description" label={t("newProject.businessCase")} optional={t("newProject.optional")}>
                <TextArea id="description" value={draft.description} onChange={(v) => patch({ description: v })} placeholder={t("newProject.businessCasePh")} rows={3} />
              </Field>
            </div>
            <Field id="ownerId" label={t("newProject.manager")} error={errors.ownerId}>
              <Select id="ownerId" value={draft.ownerId} onChange={(v) => { const members = { ...draft.members }; if (members[draft.ownerId] === "owner") delete members[draft.ownerId]; members[v] = "owner"; patch({ ownerId: v, members }); }}>
                {USERS.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </Select>
            </Field>
            <Field id="sponsorId" label={t("newProject.sponsor")} optional={t("newProject.optional")}>
              <Select id="sponsorId" value={draft.sponsorId} onChange={(v) => patch({ sponsorId: v })}>
                <option value="">—</option>
                {USERS.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </Select>
            </Field>
            <Field id="priority" label={t("newProject.priority")}>
              <Select id="priority" value={draft.priority} onChange={(v) => patch({ priority: v as Priority })}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{t(`tasks.priority.${p}`)}</option>)}
              </Select>
            </Field>
          </div>
        )}

        {step === "scope" && (
          <div className="grid gap-5 md:grid-cols-2">
            <Field label={t("newProject.objectives")} hint={t("newProject.objectivesHint")}>
              <ListEditor items={draft.objectives} onChange={(v) => patch({ objectives: v })} placeholder={t("newProject.objectivePh")} addLabel={t("newProject.add")} removeLabel={t("newProject.remove")} />
            </Field>
            <Field label={t("newProject.deliverables")}>
              <ListEditor items={draft.deliverables} onChange={(v) => patch({ deliverables: v })} placeholder={t("newProject.deliverablePh")} addLabel={t("newProject.add")} removeLabel={t("newProject.remove")} />
            </Field>
            <Field id="inScope" label={t("newProject.inScope")} optional={t("newProject.optional")}>
              <TextArea id="inScope" value={draft.inScope} onChange={(v) => patch({ inScope: v })} placeholder={t("newProject.inScopePh")} rows={4} />
            </Field>
            <Field id="outOfScope" label={t("newProject.outOfScope")} optional={t("newProject.optional")}>
              <TextArea id="outOfScope" value={draft.outOfScope} onChange={(v) => patch({ outOfScope: v })} placeholder={t("newProject.outOfScopePh")} rows={4} />
            </Field>
            <div className="md:col-span-2">
              <Field id="successCriteria" label={t("newProject.successCriteria")} optional={t("newProject.optional")}>
                <TextArea id="successCriteria" value={draft.successCriteria} onChange={(v) => patch({ successCriteria: v })} placeholder={t("newProject.successCriteriaPh")} rows={3} />
              </Field>
            </div>
            <Field label={t("newProject.assumptions")}>
              <ListEditor items={draft.assumptions} onChange={(v) => patch({ assumptions: v })} placeholder={t("newProject.assumptionPh")} addLabel={t("newProject.add")} removeLabel={t("newProject.remove")} />
            </Field>
            <Field label={t("newProject.constraints")}>
              <ListEditor items={draft.constraints} onChange={(v) => patch({ constraints: v })} placeholder={t("newProject.constraintPh")} addLabel={t("newProject.add")} removeLabel={t("newProject.remove")} />
            </Field>
          </div>
        )}

        {step === "schedule" && (
          <div className="grid gap-5 md:grid-cols-3">
            <Input name="plannedStart" type="date" label={t("newProject.plannedStart")} value={draft.plannedStart} onChange={(e) => patch({ plannedStart: e.target.value })} error={errors.plannedStart} />
            <Input name="plannedDue" type="date" label={t("newProject.plannedDue")} value={draft.plannedDue} min={draft.plannedStart || undefined} onChange={(e) => patch({ plannedDue: e.target.value })} error={errors.plannedDue} />
            <Field label={t("newProject.calendar")} error={errors.workingDays} hint={workingDays != null ? `${fmtWeekdays(draft.workingDays, locale)} · ${t("newProject.workingDays", { n: workingDays })}` : t("newProject.calendarHint")}>
              <div role="group" aria-label={t("newProject.calendar")} className="flex min-h-10 flex-wrap gap-1.5">
                {WEEKDAYS.map((d) => {
                  const on = draft.workingDays.includes(d);
                  return (
                    <label key={d} className={cx("inline-flex h-10 cursor-pointer select-none items-center gap-1.5 rounded-md border-[1.5px] px-2.5 text-[13px] font-medium transition-colors", on ? "border-brand-600 bg-brand-50 text-brand-700" : "border-line bg-surface text-ink-700 hover:border-ink-300")}>
                      <input type="checkbox" checked={on} onChange={() => toggleDay(d)} className="h-4 w-4 rounded border-line accent-brand-600" />
                      {fmtWeekday(d, locale)}
                    </label>
                  );
                })}
              </div>
            </Field>
            <div className="md:col-span-3">
              <Field label={t("newProject.milestones")} error={errors.milestones}>
                <MilestoneEditor items={draft.milestones} onChange={(v) => patch({ milestones: v })} min={draft.plannedStart} max={draft.plannedDue} />
              </Field>
            </div>
          </div>
        )}

        {step === "cost" && (
          <div className="grid gap-5 md:grid-cols-3">
            <Input name="budget" type="number" inputMode="decimal" min={0} step="1000" label={t("newProject.budget")} value={draft.budget} onChange={(e) => patch({ budget: e.target.value })} error={errors.budget} />
            <Field id="currency" label={t("newProject.currency")}>
              <Select id="currency" value={draft.currency} onChange={(v) => patch({ currency: v })}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </Field>
            <Input name="contingencyPct" type="number" inputMode="numeric" min={0} max={100} label={t("newProject.contingency")} hint={errors.contingencyPct ? undefined : `${t("newProject.contingencyHint")} · ${t("newProject.totalWithReserve")}: ${fmtMoney(costPreview.totalWithReserve, locale, costPreview.currency)}`} value={draft.contingencyPct} onChange={(e) => patch({ contingencyPct: e.target.value })} error={errors.contingencyPct} trailing={<span className="text-[13px]">%</span>} />
          </div>
        )}

        {step === "team" && (
          <div className="grid gap-6">
            <Field label={t("newProject.team")} hint={t("newProject.teamHint")}>
              <ul className="divide-y divide-line rounded-md border border-line">
                {USERS.map((u, i) => {
                  const isOwner = u.id === draft.ownerId;
                  const role = draft.members[u.id] ?? "";
                  return (
                    <li key={u.id} className="flex items-center gap-3 px-3 py-2">
                      <Avatar initials={u.initials} name={u.name} size={28} index={i} />
                      <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-medium text-ink-900">{u.name}</p><p className="truncate text-[12px] text-ink-500">{u.email}</p></div>
                      <div className="w-44 shrink-0 sm:w-56">
                        <Select ariaLabel={`${u.name}: ${t("newProject.stakeholderRole")}`} value={isOwner ? "owner" : role} disabled={isOwner}
                          onChange={(v) => { const members = { ...draft.members }; if (v) members[u.id] = v as ProjectRole; else delete members[u.id]; patch({ members }); }}>
                          {!isOwner && <option value="">{t("newProject.notOnTeam")}</option>}
                          {PROJECT_ROLES.filter((r) => isOwner || r !== "owner").map((r) => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}
                        </Select>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <Button type="button" variant="ghost" size="sm" icon={<Icons.userPlus className="h-4 w-4" />} onClick={() => setCreatingUser(true)}>{t("newProject.createUser")}</Button>
                {pendingMember && <span className="text-[12px] text-ink-500">{t("common.loading")}</span>}
              </div>
            </Field>
            <Field label={t("newProject.stakeholders")} error={errors.stakeholders}>
              <StakeholderEditor items={draft.stakeholders} onChange={(v) => patch({ stakeholders: v })} />
            </Field>
            <div className="grid gap-5 md:grid-cols-2">
              <Field id="reportingCadence" label={t("newProject.reporting")}>
                <Select id="reportingCadence" value={draft.reportingCadence} onChange={(v) => patch({ reportingCadence: v as ReportingCadence })}>
                  {CADENCES.map((c) => <option key={c} value={c}>{t(`newProject.${c}`)}</option>)}
                </Select>
              </Field>
              <Input name="channel" label={`${t("newProject.channel")} (${t("newProject.optional")})`} placeholder={t("newProject.channelPh")} value={draft.channel} onChange={(e) => patch({ channel: e.target.value })} maxLength={120} />
            </div>
          </div>
        )}

        {step === "backlog" && (
          <Field label={t("newProject.backlog.title")} hint={t("newProject.backlog.hint")} error={errors.backlog}>
            <BacklogEditor items={draft.backlog} onChange={(v) => patch({ backlog: v })} members={Object.keys({ ...draft.members, [draft.ownerId]: "owner" })} />
          </Field>
        )}

        {step === "risks" && (
          <div className="grid gap-6">
            <Field label={t("newProject.risks")} error={errors.risks}>
              <RiskEditor items={draft.risks} onChange={(v) => patch({ risks: v })} />
            </Field>
            <section>
              <h3 className="text-[15px] font-semibold text-ink-900">{t("newProject.review")}</h3>
              <p className="mb-3 text-[13px] text-ink-500">{t("newProject.reviewHint")}</p>
              <Review draft={draft} workingDays={workingDays} cost={costPreview} onEdit={goTo} />
            </section>
          </div>
        )}
      </Card>

      {submitError && step === "risks" && (
        <div role="alert" className="mt-4 flex items-start gap-2 rounded-md border border-danger-600/30 bg-danger-50 px-3 py-2.5 text-[13px] text-danger-700">
          <Icons.warning className="mt-0.5 h-4 w-4 shrink-0" />{submitError}
        </div>
      )}
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-[12px] text-ink-500">{t("newProject.stepOf", { n: idx + 1, total: STEPS.length })}</span>
        <div className="flex gap-2">
          {idx > 0 && <Button variant="secondary" onClick={back} disabled={submitting}>{t("newProject.back")}</Button>}
          {idx < STEPS.length - 1
            ? <Button onClick={next} icon={<Icons.chevron className="h-4 w-4" />}>{t("newProject.next")}</Button>
            : <Button onClick={create} isLoading={submitting} icon={<Icons.check className="h-4 w-4" />}>{submitting ? t("newProject.creating") : t("newProject.create")}</Button>}
        </div>
      </div>
      <AddUserDialog open={creatingUser} onClose={() => setCreatingUser(false)}
        users={USERS.map((u) => ({ id: u.id, name: u.name, email: u.email, initials: u.initials, capacity: 1 }))}
        onAdd={(u) => {
          setCreatingUser(false);
          // Join the team with their role from the dialog (the owner role stays with the project manager).
          setPendingMember({ id: u.id, email: u.email.toLowerCase(), role: u.defaultRole && u.defaultRole !== "owner" ? u.defaultRole : "contributor" });
          reloadUsers();
        }} />
    </div>
    </UsersContext.Provider>
  );
}

/* ─── Editors local to the wizard ────────────────────────────────────────── */
function RowButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" aria-label={label} title={label} onClick={onClick} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded text-ink-400 hover:bg-slate-100 hover:text-danger-700"><Icons.x className="h-4 w-4" /></button>;
}

function ListEditor({ items, onChange, placeholder, addLabel, removeLabel }: { items: string[]; onChange: (v: string[]) => void; placeholder: string; addLabel: string; removeLabel: string }) {
  const [text, setText] = useState("");
  const commit = () => { const v = text.trim(); if (!v) return; onChange([...items, v]); setText(""); };
  return (
    <div className="space-y-2">
      {items.length > 0 && (
        <ol className="space-y-1">
          {items.map((it, i) => (
            <li key={i} className="flex items-center gap-2 rounded-md bg-slate-50 ps-3 text-[13px] text-ink-900">
              <span className="w-4 shrink-0 text-[11px] tabular-nums text-ink-400">{i + 1}.</span><span className="flex-1 py-1.5">{it}</span>
              <RowButton label={removeLabel} onClick={() => onChange(items.filter((_, j) => j !== i))} />
            </li>
          ))}
        </ol>
      )}
      <div className="flex gap-2">
        <input value={text} placeholder={placeholder} maxLength={160} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }} className={cx(controlCls, "placeholder:text-ink-400")} />
        <Button type="button" variant="secondary" onClick={commit} disabled={!text.trim()} icon={<Icons.plus className="h-4 w-4" />}>{addLabel}</Button>
      </div>
    </div>
  );
}

function MilestoneEditor({ items, onChange, min, max }: { items: Milestone[]; onChange: (v: Milestone[]) => void; min: string; max: string }) {
  const { t } = useT();
  const update = (i: number, p: Partial<Milestone>) => onChange(items.map((m, j) => (j === i ? { ...m, ...p } : m)));
  return (
    <div className="space-y-2">
      {items.map((m, i) => (
        <div key={i} className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input value={m.title} placeholder={t("newProject.milestonePh")} maxLength={80} onChange={(e) => update(i, { title: e.target.value })} className={cx(controlCls, "placeholder:text-ink-400 sm:flex-1")} />
          <div className="flex items-center gap-2">
            <input type="date" aria-label={t("newProject.milestoneDate")} value={m.date} min={min || undefined} max={max || undefined} onChange={(e) => update(i, { date: e.target.value })} className={cx(controlCls, "sm:w-44")} />
            <RowButton label={t("newProject.remove")} onClick={() => onChange(items.filter((_, j) => j !== i))} />
          </div>
        </div>
      ))}
      <Button type="button" variant="secondary" size="sm" icon={<Icons.plus className="h-4 w-4" />} onClick={() => onChange([...items, { title: "", date: "" }])}>{t("newProject.addMilestone")}</Button>
    </div>
  );
}

function LevelSelect({ value, onChange, label }: { value: Level; onChange: (v: Level) => void; label: string }) {
  const { t } = useT();
  return <Select ariaLabel={label} value={value} onChange={(v) => onChange(v as Level)} className="sm:w-32">{LEVELS.map((l) => <option key={l} value={l}>{t(`newProject.${l}`)}</option>)}</Select>;
}

function StakeholderEditor({ items, onChange }: { items: Stakeholder[]; onChange: (v: Stakeholder[]) => void }) {
  const { t } = useT();
  const update = (i: number, p: Partial<Stakeholder>) => onChange(items.map((s, j) => (j === i ? { ...s, ...p } : s)));
  return (
    <div className="space-y-2">
      {items.length > 0 && (
        <div className="hidden gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-ink-400 sm:flex">
          <span className="flex-1">{t("newProject.stakeholderName")}</span><span className="w-40">{t("newProject.stakeholderRole")}</span><span className="w-32">{t("newProject.interest")}</span><span className="w-32">{t("newProject.influence")}</span><span className="w-8" />
        </div>
      )}
      {items.map((s, i) => (
        <div key={i} className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input value={s.name} placeholder={t("newProject.stakeholderName")} maxLength={80} onChange={(e) => update(i, { name: e.target.value })} className={cx(controlCls, "placeholder:text-ink-400 sm:flex-1")} />
          <input value={s.role} placeholder={t("newProject.stakeholderRole")} maxLength={60} onChange={(e) => update(i, { role: e.target.value })} className={cx(controlCls, "placeholder:text-ink-400 sm:w-40")} />
          <div className="flex items-center gap-2">
            <LevelSelect label={t("newProject.interest")} value={s.interest} onChange={(v) => update(i, { interest: v })} />
            <LevelSelect label={t("newProject.influence")} value={s.influence} onChange={(v) => update(i, { influence: v })} />
            <RowButton label={t("newProject.remove")} onClick={() => onChange(items.filter((_, j) => j !== i))} />
          </div>
        </div>
      ))}
      <Button type="button" variant="secondary" size="sm" icon={<Icons.plus className="h-4 w-4" />} onClick={() => onChange([...items, { name: "", role: "", interest: "medium", influence: "medium" }])}>{t("newProject.addStakeholder")}</Button>
    </div>
  );
}

export function riskScore(r: Pick<Risk, "probability" | "impact">) { return LEVEL_SCORE[r.probability] * LEVEL_SCORE[r.impact]; }
export function riskTone(score: number): "ok" | "warn" | "danger" { return score >= 6 ? "danger" : score >= 3 ? "warn" : "ok"; }

function RiskEditor({ items, onChange }: { items: Risk[]; onChange: (v: Risk[]) => void }) {
  const { t } = useT();
  const update = (i: number, p: Partial<Risk>) => onChange(items.map((r, j) => (j === i ? { ...r, ...p } : r)));
  return (
    <div className="space-y-2">
      {items.length > 0 && (
        <div className="hidden gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-ink-400 sm:flex">
          <span className="flex-1">{t("newProject.riskTitle")}</span><span className="w-32">{t("newProject.probability")}</span><span className="w-32">{t("newProject.impact")}</span><span className="w-12 text-center">{t("newProject.score")}</span><span className="w-32">{t("newProject.response")}</span><span className="w-8" />
        </div>
      )}
      {items.map((r, i) => {
        const score = riskScore(r);
        return (
          <div key={i} className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input value={r.title} placeholder={t("newProject.riskPh")} maxLength={120} onChange={(e) => update(i, { title: e.target.value })} className={cx(controlCls, "placeholder:text-ink-400 sm:flex-1")} />
            <div className="flex flex-wrap items-center gap-2">
              <LevelSelect label={t("newProject.probability")} value={r.probability} onChange={(v) => update(i, { probability: v })} />
              <LevelSelect label={t("newProject.impact")} value={r.impact} onChange={(v) => update(i, { impact: v })} />
              <span className="inline-flex w-12 justify-center"><Pill tone={riskTone(score)}>{score}</Pill></span>
              <Select ariaLabel={t("newProject.response")} value={r.response} onChange={(v) => update(i, { response: v as RiskResponse })} className="sm:w-32">
                {RESPONSES.map((x) => <option key={x} value={x}>{t(`newProject.${x}`)}</option>)}
              </Select>
              <RowButton label={t("newProject.remove")} onClick={() => onChange(items.filter((_, j) => j !== i))} />
            </div>
          </div>
        );
      })}
      <Button type="button" variant="secondary" size="sm" icon={<Icons.plus className="h-4 w-4" />} onClick={() => onChange([...items, { title: "", probability: "medium", impact: "medium", response: "mitigate" }])}>{t("newProject.addRisk")}</Button>
    </div>
  );
}

/* ─── Backlog editor ─────────────────────────────────────────────────────── */
export const backlogStats = (items: BacklogItem[]) => ({
  n: items.length,
  points: items.reduce((s, b) => s + (b.storyPoints ?? 0), 0),
  hours: items.reduce((s, b) => s + (b.plannedHours ?? 0), 0),
});
export const moscowTone = (m: MoSCoW): "danger" | "warn" | "brand" | "neutral" => (m === "must" ? "danger" : m === "should" ? "warn" : m === "could" ? "brand" : "neutral");

function BacklogEditor({ items, onChange, members }: { items: BacklogItem[]; onChange: (v: BacklogItem[]) => void; members: string[] }) {
  const { t } = useT();
  const [open, setOpen] = useState<string | null>(null);
  const deliverables = items.filter((b) => b.type === "deliverable");
  const stats = backlogStats(items);
  const add = (type: BacklogType) => {
    const item: BacklogItem = { id: newItemId(), type, title: "", priority: "medium", moscow: "should", scenarios: [] };
    onChange([...items, item]); setOpen(item.id);
  };
  const update = (id: string, p: Partial<BacklogItem>) => onChange(items.map((b) => (b.id === id ? { ...b, ...p } : b)));
  const remove = (id: string) => onChange(items.filter((b) => b.id !== id).map((b) => (b.parentId === id ? { ...b, parentId: undefined } : b)));
  const assignees = useContext(UsersContext).filter((u) => members.includes(u.id));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {BACKLOG_TYPES.map((ty) => (
          <Button key={ty} type="button" variant="secondary" size="sm" icon={<Icons.plus className="h-3.5 w-3.5" />} onClick={() => add(ty)}>{t(`newProject.backlog.${ty}`)}</Button>
        ))}
        {items.length > 0 && <span className="ms-auto text-[12px] tabular-nums text-ink-500">{t("newProject.backlog.summary", stats)}</span>}
      </div>
      {items.length === 0 && <p className="rounded-md border border-dashed border-ink-300 p-6 text-center text-[13px] text-ink-500">{t("newProject.backlog.noItems")}</p>}
      <ol className="space-y-2">
        {items.map((b, i) => {
          const editing = open === b.id;
          const parent = b.parentId ? items.find((x) => x.id === b.parentId) : undefined;
          return (
            <li key={b.id} className={cx("rounded-md border bg-surface", editing ? "border-brand-600 ring-2 ring-brand-600/15" : "border-line")}>
              <div className="flex items-center gap-2 px-3 py-2">
                <span className="w-5 shrink-0 text-[11px] tabular-nums text-ink-400">{i + 1}.</span>
                <Pill tone={typeTone(b.type)}>{t(`newProject.backlog.${b.type}`)}</Pill>
                <span className={cx("min-w-0 flex-1 truncate text-[13px]", b.title ? "font-medium text-ink-900" : "italic text-ink-400")}>{b.title || t("newProject.backlog.itemTitlePh")}</span>
                {parent && <span className="hidden truncate text-[12px] text-ink-400 md:inline">↳ {parent.title || t("newProject.backlog.deliverable")}</span>}
                <Pill tone={moscowTone(b.moscow)}>{t(`newProject.backlog.${b.moscow}`)}</Pill>
                <span className="hidden sm:inline"><PriorityDot priority={b.priority} label={t(`tasks.priority.${b.priority}`)} /></span>
                {b.storyPoints != null && <span className="hidden text-[12px] tabular-nums text-ink-500 sm:inline">{b.storyPoints} pts</span>}
                {b.scenarios.length > 0 && <span className="hidden text-[12px] tabular-nums text-ink-500 sm:inline">{b.scenarios.length} ✓</span>}
                <button type="button" onClick={() => setOpen(editing ? null : b.id)} className="text-[12px] font-medium text-brand-700 hover:underline">{editing ? t("newProject.backlog.collapse") : t("newProject.backlog.expand")}</button>
                <RowButton label={t("newProject.remove")} onClick={() => remove(b.id)} />
              </div>
              {editing && (
                <div className="grid gap-4 border-t border-line p-3 md:grid-cols-3">
                  <div className="md:col-span-2"><Input name={`bt-${b.id}`} label={t("newProject.backlog.itemTitle")} placeholder={t("newProject.backlog.itemTitlePh")} value={b.title} maxLength={120} autoFocus onChange={(e) => update(b.id, { title: e.target.value })} /></div>
                  <Field id={`ty-${b.id}`} label={t("newProject.backlog.type")}>
                    <Select id={`ty-${b.id}`} value={b.type} onChange={(v) => update(b.id, { type: v as BacklogType, parentId: v === "deliverable" ? undefined : b.parentId })}>{BACKLOG_TYPES.map((ty) => <option key={ty} value={ty}>{t(`newProject.backlog.${ty}`)}</option>)}</Select>
                  </Field>
                  <div className="md:col-span-3">
                    <Field id={`ds-${b.id}`} label={t("newProject.backlog.description")} optional={t("newProject.optional")}>
                      <TextArea id={`ds-${b.id}`} value={b.description ?? ""} rows={2} placeholder={t(TYPE_PH[b.type])} onChange={(v) => update(b.id, { description: v })} />
                    </Field>
                  </div>
                  <Field id={`mo-${b.id}`} label={t("newProject.backlog.moscow")}>
                    <Select id={`mo-${b.id}`} value={b.moscow} onChange={(v) => update(b.id, { moscow: v as MoSCoW })}>{MOSCOW.map((m) => <option key={m} value={m}>{t(`newProject.backlog.${m}`)}</option>)}</Select>
                  </Field>
                  <Field id={`pr-${b.id}`} label={t("newProject.priority")}>
                    <Select id={`pr-${b.id}`} value={b.priority} onChange={(v) => update(b.id, { priority: v as Priority })}>{PRIORITIES.map((p) => <option key={p} value={p}>{t(`tasks.priority.${p}`)}</option>)}</Select>
                  </Field>
                  <Field id={`as-${b.id}`} label={t("newProject.backlog.assignee")}>
                    <Select id={`as-${b.id}`} value={b.assigneeId ?? ""} onChange={(v) => update(b.id, { assigneeId: v || undefined })}>
                      <option value="">{t("newProject.backlog.unassigned")}</option>
                      {assignees.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </Select>
                  </Field>
                  <Field id={`sp-${b.id}`} label={t("newProject.backlog.effort")}>
                    <Select id={`sp-${b.id}`} value={b.storyPoints != null ? String(b.storyPoints) : ""} onChange={(v) => update(b.id, { storyPoints: v ? Number(v) : undefined })}>
                      <option value="">—</option>
                      {POINTS.map((p) => <option key={p} value={p}>{p}</option>)}
                    </Select>
                  </Field>
                  <Input name={`hr-${b.id}`} type="number" inputMode="numeric" min={0} label={t("newProject.backlog.hours")} value={b.plannedHours != null ? String(b.plannedHours) : ""} onChange={(e) => update(b.id, { plannedHours: e.target.value === "" ? undefined : Math.max(0, Number(e.target.value)) })} />
                  {b.type !== "deliverable" && (
                    <Field id={`ep-${b.id}`} label={t("newProject.backlog.parent")}>
                      <Select id={`ep-${b.id}`} value={b.parentId ?? ""} onChange={(v) => update(b.id, { parentId: v || undefined })}>
                        <option value="">{t("newProject.backlog.noParent")}</option>
                        {deliverables.filter((e) => e.id !== b.id).map((e) => <option key={e.id} value={e.id}>{e.title || t("newProject.backlog.deliverable")}</option>)}
                      </Select>
                    </Field>
                  )}
                  <div className="md:col-span-3">
                    <Field label={t("newProject.backlog.scenarios")} optional={t("newProject.optional")}>
                      <ScenarioEditor items={b.scenarios} onChange={(v) => update(b.id, { scenarios: v })} />
                    </Field>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function ScenarioEditor({ items, onChange }: { items: Scenario[]; onChange: (v: Scenario[]) => void }) {
  const { t } = useT();
  const update = (i: number, p: Partial<Scenario>) => onChange(items.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const cell = (label: string, value: string, ph: string, set: (v: string) => void) => (
    <label className="flex items-start gap-2 text-[13px]">
      <span className="w-14 shrink-0 pt-2 font-semibold text-ink-500">{label}</span>
      <input value={value} placeholder={ph} maxLength={200} onChange={(e) => set(e.target.value)} className={cx(controlCls, "h-9 text-[13px] placeholder:text-ink-400")} />
    </label>
  );
  return (
    <div className="space-y-2">
      {items.map((s, i) => (
        <div key={i} className="space-y-1.5 rounded-md bg-slate-50 p-2.5">
          <div className="flex items-center gap-2">
            <input value={s.title} placeholder={t("newProject.backlog.scenarioPh")} maxLength={120} onChange={(e) => update(i, { title: e.target.value })} className={cx(controlCls, "h-9 flex-1 text-[13px] font-medium placeholder:font-normal placeholder:text-ink-400")} aria-label={t("newProject.backlog.scenarioTitle")} />
            <RowButton label={t("newProject.remove")} onClick={() => onChange(items.filter((_, j) => j !== i))} />
          </div>
          {cell(t("newProject.backlog.given"), s.given, t("newProject.backlog.givenPh"), (v) => update(i, { given: v }))}
          {cell(t("newProject.backlog.when"), s.when, t("newProject.backlog.whenPh"), (v) => update(i, { when: v }))}
          {cell(t("newProject.backlog.then"), s.then, t("newProject.backlog.thenPh"), (v) => update(i, { then: v }))}
        </div>
      ))}
      <Button type="button" variant="secondary" size="sm" icon={<Icons.plus className="h-4 w-4" />} onClick={() => onChange([...items, { title: "", given: "", when: "", then: "" }])}>{t("newProject.backlog.addScenario")}</Button>
    </div>
  );
}

/** Read-only rendering of a backlog (shared by the wizard review and the project charter card). */
export function BacklogList({ items }: { items: BacklogItem[] }) {
  const { t } = useT();
  const nameOf = useNameOf();
  if (items.length === 0) return <span className="text-ink-400">{t("newProject.none")}</span>;
  const byId = new Map(items.map((b) => [b.id, b]));
  return (
    <ul className="space-y-1.5">
      {items.map((b) => (
        <li key={b.id} className="text-[13px]">
          <div className="flex flex-wrap items-center gap-1.5">
            <Pill tone={typeTone(b.type)}>{t(`newProject.backlog.${b.type}`)}</Pill>
            <span className="font-medium text-ink-900">{b.title || "—"}</span>
            {b.parentId && byId.get(b.parentId) && <span className="text-ink-400">↳ {byId.get(b.parentId)!.title}</span>}
            <Pill tone={moscowTone(b.moscow)}>{t(`newProject.backlog.${b.moscow}`)}</Pill>
            <PriorityDot priority={b.priority} label={t(`tasks.priority.${b.priority}`)} />
            {b.storyPoints != null && <span className="text-[12px] tabular-nums text-ink-500">{b.storyPoints} pts</span>}
            {b.plannedHours != null && <span className="text-[12px] tabular-nums text-ink-500">{b.plannedHours} h</span>}
            {b.assigneeId && <span className="text-[12px] text-ink-500">· {nameOf(b.assigneeId)}</span>}
          </div>
          {b.description && <p className="mt-0.5 text-ink-500">{b.description}</p>}
          {b.scenarios.length > 0 && (
            <ul className="mt-1 space-y-1 border-s-2 border-line ps-3">
              {b.scenarios.map((s, i) => (
                <li key={i} className="text-[12px] text-ink-700">
                  {s.title && <span className="font-medium">{s.title}: </span>}
                  <span className="font-semibold text-ink-500">{t("newProject.backlog.given")}</span> {s.given || "—"} · <span className="font-semibold text-ink-500">{t("newProject.backlog.when")}</span> {s.when || "—"} · <span className="font-semibold text-ink-500">{t("newProject.backlog.then")}</span> {s.then || "—"}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

/* ─── Review summary ─────────────────────────────────────────────────────── */
function Review({ draft, workingDays, cost, onEdit }: { draft: Draft; workingDays: number | null; cost: ProjectCost; onEdit: (s: Step) => void }) {
  const { t, locale } = useT();
  const nameOf = useNameOf();
  const none = <span className="text-ink-400">{t("newProject.none")}</span>;
  const list = (items: string[]) => (items.length ? <ul className="list-disc space-y-0.5 ps-4">{items.map((x, i) => <li key={i}>{x}</li>)}</ul> : none);
  const team = useMemo(() => Object.entries({ ...draft.members, [draft.ownerId]: "owner" as ProjectRole }).map(([id, r]) => `${nameOf(id)} · ${t(`roles.${r}`)}`), [draft.members, draft.ownerId, t, nameOf]);
  const Section = ({ step, title, children }: { step: Step; title: string; children: ReactNode }) => (
    <section className="rounded-md border border-line p-3">
      <header className="mb-2 flex items-center justify-between"><h4 className="text-[13px] font-semibold text-ink-900">{title}</h4><button type="button" onClick={() => onEdit(step)} className="text-[12px] font-medium text-brand-700 hover:underline">{t("newProject.back")}</button></header>
      <dl className="grid gap-x-4 gap-y-1.5 text-[13px] text-ink-700 sm:grid-cols-[minmax(120px,auto)_1fr]">{children}</dl>
    </section>
  );
  const Row = ({ k, v }: { k: string; v: ReactNode }) => <><dt className="text-ink-500">{k}</dt><dd className="min-w-0">{v}</dd></>;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Section step="charter" title={t("newProject.steps.charter")}>
        <Row k={t("newProject.name")} v={<span className="font-medium text-ink-900">{draft.title || none}{draft.code && <span className="ms-2 font-mono text-[12px] text-ink-400">{draft.code}</span>}</span>} />
        <Row k={t("newProject.category")} v={draft.category || none} />
        <Row k={t("newProject.manager")} v={nameOf(draft.ownerId)} />
        <Row k={t("newProject.sponsor")} v={draft.sponsorId ? nameOf(draft.sponsorId) : none} />
        <Row k={t("newProject.priority")} v={t(`tasks.priority.${draft.priority}`)} />
        {draft.description && <Row k={t("newProject.businessCase")} v={draft.description} />}
      </Section>
      <Section step="scope" title={t("newProject.steps.scope")}>
        <Row k={t("newProject.objectives")} v={list(draft.objectives)} />
        <Row k={t("newProject.deliverables")} v={list(draft.deliverables)} />
        {draft.inScope && <Row k={t("newProject.inScope")} v={draft.inScope} />}
        {draft.outOfScope && <Row k={t("newProject.outOfScope")} v={draft.outOfScope} />}
        {draft.successCriteria && <Row k={t("newProject.successCriteria")} v={draft.successCriteria} />}
        <Row k={t("newProject.assumptions")} v={list(draft.assumptions)} />
        <Row k={t("newProject.constraints")} v={list(draft.constraints)} />
      </Section>
      <Section step="schedule" title={t("newProject.steps.schedule")}>
        <Row k={t("newProject.plannedStart")} v={fmtDate(draft.plannedStart || null, locale)} />
        <Row k={t("newProject.plannedDue")} v={<>{fmtDate(draft.plannedDue || null, locale)}{workingDays != null && <span className="ms-2 text-ink-400">· {t("newProject.workingDays", { n: workingDays })}</span>}</>} />
        <Row k={t("newProject.calendar")} v={fmtWeekdays(draft.workingDays, locale)} />
        <Row k={t("newProject.milestones")} v={draft.milestones.length ? <ul className="space-y-0.5">{[...draft.milestones].sort((a, b) => a.date.localeCompare(b.date)).map((m, i) => <li key={i}>{m.title || "—"} <span className="text-ink-400">· {fmtDate(m.date || null, locale)}</span></li>)}</ul> : none} />
      </Section>
      <Section step="cost" title={t("newProject.steps.cost")}>
        <Row k={t("newProject.budget")} v={fmtMoney(cost.budget, locale, cost.currency)} />
        <Row k={t("newProject.contingency")} v={<>{cost.contingencyPct}% <span className="text-ink-400">· {t("newProject.totalWithReserve")}: {fmtMoney(cost.totalWithReserve, locale, cost.currency)}</span></>} />
      </Section>
      <Section step="team" title={t("newProject.steps.team")}>
        <Row k={t("newProject.team")} v={list(team)} />
        <Row k={t("newProject.stakeholders")} v={list(draft.stakeholders.map((s) => `${s.name || "—"}${s.role ? ` · ${s.role}` : ""} · ${t("newProject.interest")} ${t(`newProject.${s.interest}`)} · ${t("newProject.influence")} ${t(`newProject.${s.influence}`)}`))} />
        <Row k={t("newProject.reporting")} v={t(`newProject.${draft.reportingCadence}`)} />
        {draft.channel && <Row k={t("newProject.channel")} v={draft.channel} />}
      </Section>
      <div className="md:col-span-2">
        <Section step="backlog" title={t("newProject.backlog.title")}>
          <Row k={t("newProject.backlog.summary", backlogStats(draft.backlog))} v={<BacklogList items={draft.backlog} />} />
        </Section>
      </div>
      <div className="md:col-span-2">
        <Section step="risks" title={t("newProject.risks")}>
          <Row k={t("newProject.risks")} v={draft.risks.length ? <ul className="space-y-1">{draft.risks.map((r, i) => <li key={i} className="flex flex-wrap items-center gap-2">{r.title || "—"}<Pill tone={riskTone(riskScore(r))}>{t("newProject.score")} {riskScore(r)}</Pill><span className="text-ink-400">{t(`newProject.${r.response}`)}</span></li>)}</ul> : none} />
        </Section>
      </div>
    </div>
  );
}
