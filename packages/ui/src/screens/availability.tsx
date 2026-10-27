"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, availabilityApi, isAvailabilityNotFound, type AvailabilityBreak, type AvailabilityConfigDto, type AvailabilityDay, type AvailabilityException, type AvailabilitySlot } from "@ptp/api";
import { useAllProjects } from "../api-projects";
import { DEFAULT_HOURS, SLOT_MINUTES, START_TIME_OPTIONS, TIME_OPTIONS, addDays, dayOfWeek, getMonthDates, getWeekDates, isWithinWorkingWeek, sameMonth } from "../availability";
import { useApp, useT } from "../context";
import { fmtDate, fmtWeekday } from "../data";
import { Button, Card, Field, Icons, Modal, PageHeader, Pill, Select, Spinner, Switch, cx } from "../primitives";

/**
 * Availability per project, bound to /admin/availability:
 *   GET  getAvailabilityConfigByProject/:projectID  → config (404 = none yet → defaults)
 *   POST upsertAvailabilityConfig                   → first save
 *   GET  getAvailabilitySlots/:projectID?from&to    → day cards
 *   PUT  updateAvailabilityConfig/:id               → every other change (returns no data → refetch)
 */
const DEFAULTS = { startDay: 0, endDay: 4, workStart: DEFAULT_HOURS.start, workEnd: DEFAULT_HOURS.end };
const PROJECT_KEY = "ptp.availability.project";
const DAY_OPTIONS = [0, 1, 2, 3, 4, 5, 6];
type Flash = { tone: "ok" | "warn"; text: string } | null;

export function AvailabilityScreen() {
  const { t, locale } = useT();
  const { today } = useApp();
  const { projects, loading: projectsLoading, error: projectsError } = useAllProjects(today);

  const [projectId, setProjectId] = useState("");
  const [config, setConfig] = useState<AvailabilityConfigDto | null>(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [days, setDays] = useState<AvailabilityDay[]>([]);
  const [daysLoading, setDaysLoading] = useState(false);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [busy, setBusy] = useState<string | null>(null); // which action is running
  const [flash, setFlash] = useState<Flash>(null);
  const [refDate, setRefDate] = useState(today);
  const [daysNonce, setDaysNonce] = useState(0);
  const [configNonce, setConfigNonce] = useState(0);

  // Toolbar form (seeded from the config, or the defaults when the project has none).
  const [startDay, setStartDay] = useState(DEFAULTS.startDay);
  const [endDay, setEndDay] = useState(DEFAULTS.endDay);
  const [workStart, setWorkStart] = useState(DEFAULTS.workStart);
  const [workEnd, setWorkEnd] = useState(DEFAULTS.workEnd);
  const [breakEnabled, setBreakEnabled] = useState(false);
  const [breakStart, setBreakStart] = useState("12:00");
  const [breakEnd, setBreakEnd] = useState("13:00");
  const [editing, setEditing] = useState<{ day: AvailabilityDay; index: number } | null>(null);
  const [editActive, setEditActive] = useState(true);

  const weekDates = useMemo(() => getWeekDates(refDate), [refDate]);
  const breakTime: AvailabilityBreak | null = breakEnabled ? { start: breakStart, end: breakEnd } : null;
  const errorText = (err: unknown) => (err instanceof ApiError && err.localized(locale)) || t("availability.actionFailed");

  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(null), 3500);
    return () => clearTimeout(id);
  }, [flash]);

  // Pick the remembered project (this tab), else the first one.
  useEffect(() => {
    if (projectsLoading || projectId || !projects.length) return;
    let saved: string | null = null;
    try { saved = sessionStorage.getItem(PROJECT_KEY); } catch { /* ignore */ }
    setProjectId(projects.some((p) => p.id === saved) ? saved! : projects[0].id);
  }, [projectsLoading, projects, projectId]);

  const seedForm = (cfg: AvailabilityConfigDto | null) => {
    setStartDay(cfg?.startDay ?? DEFAULTS.startDay); setEndDay(cfg?.endDay ?? DEFAULTS.endDay);
    setWorkStart(cfg?.workStart ?? DEFAULTS.workStart); setWorkEnd(cfg?.workEnd ?? DEFAULTS.workEnd);
    setBreakEnabled(!!cfg?.breakTime);
    if (cfg?.breakTime) { setBreakStart(cfg.breakTime.start); setBreakEnd(cfg.breakTime.end); }
  };

  /** 1. Config for the selected project. */
  const loadConfig = useCallback(async (pid: string, signal?: AbortSignal) => {
    const cfg = await availabilityApi.getConfig(pid, signal);
    console.log("[availability] config", cfg);
    setConfig(cfg);
    seedForm(cfg);
    return cfg;
  }, []);

  useEffect(() => {
    if (!projectId) return;
    try { sessionStorage.setItem(PROJECT_KEY, projectId); } catch { /* ignore */ }
    const ctrl = new AbortController();
    setConfigLoading(true); setLoadError(null); setConfig(null);
    loadConfig(projectId, ctrl.signal)
      .catch((err: unknown) => { if ((err as Error)?.name !== "AbortError") setLoadError(err); })
      .finally(() => { if (!ctrl.signal.aborted) setConfigLoading(false); });
    return () => ctrl.abort();
  }, [projectId, loadConfig, configNonce]);

  /** 3. Day cards for the visible week (arrows, Today, and after every change). */
  useEffect(() => {
    if (!projectId) return;
    const ctrl = new AbortController();
    setDaysLoading(true);
    availabilityApi.getSlots(projectId, weekDates[0], weekDates[6], ctrl.signal)
      .then((d) => { console.log("[availability] slots", d); setDays(d); })
      .catch((err: unknown) => {
        if ((err as Error)?.name === "AbortError") return;
        setDays([]);
        // No config yet → cards show the toolbar's defaults until the user saves or generates.
        if (!isAvailabilityNotFound(err)) setLoadError(err);
      })
      .finally(() => { if (!ctrl.signal.aborted) setDaysLoading(false); });
    return () => ctrl.abort();
  }, [projectId, weekDates, daysNonce]);

  const refreshDays = () => setDaysNonce((n) => n + 1);

  /** The config _id, creating the config from the toolbar first when the project has none. */
  const ensureConfigId = async (): Promise<string> => {
    if (config?._id) return config._id;
    await availabilityApi.upsertConfig({ projectID: projectId, startDay, endDay, workStart, workEnd, slotDurationMinutes: SLOT_MINUTES, breakTime });
    const cfg = await loadConfig(projectId);
    if (!cfg?._id) throw new Error("Availability config was not created");
    return cfg._id;
  };

  /** Runs one action with a busy state, flash message, and a refresh of the day cards. */
  const run = async (key: string, action: () => Promise<unknown>, success: string) => {
    if (busy) return;
    setBusy(key);
    try {
      await action();
      setFlash({ tone: "ok", text: success });
    } catch (err) {
      setFlash({ tone: "warn", text: errorText(err) });
    } finally {
      setBusy(null);
      refreshDays();
    }
  };

  // 2 / 4. Save config: create when missing, otherwise update hours, days and break.
  const handleSaveConfig = () => run("save", async () => {
    if (!config?._id) await ensureConfigId();
    else { await availabilityApi.updateConfig(config._id, { startDay, endDay, workStart, workEnd, breakTime }); await loadConfig(projectId); }
  }, config ? t("availability.savedConfig") : t("availability.createdConfig"));

  /** Fetches the server's slots for a range and turns its working days into exceptions. */
  const exceptionsFor = async (from: string, to: string): Promise<AvailabilityException[]> => {
    const range = await availabilityApi.getSlots(projectId, from, to);
    return range.filter((d) => !d.dayOff).map((d) => ({ date: d.date, isDayOff: false, workStart: d.workStart ?? workStart, workEnd: d.workEnd ?? workEnd, slots: d.slots }));
  };

  // Generate slots for one day.
  const handleGenerateDay = (date: string) => run(`day:${date}`, async () => {
    const id = await ensureConfigId();
    const [exception] = await exceptionsFor(date, date);
    if (exception) await availabilityApi.updateConfig(id, { exception });
  }, t("availability.appliedDay"));

  // Apply to current week / month (month: from today when it's the current month, max 62 days).
  const applyRange = (dates: string[], key: string, msg: string) => run(key, async () => {
    if (!dates.length) return;
    const id = await ensureConfigId();
    const from = dates[0], to = dates[dates.length - 1];
    await availabilityApi.updateConfig(id, { clearExceptionsFrom: from, clearExceptionsTo: to, exceptions: await exceptionsFor(from, to) });
  }, msg);
  const handleApplyWeek = () => applyRange(weekDates, "week", t("availability.appliedWeek"));
  const handleApplyMonth = () => applyRange(getMonthDates(refDate).filter((d) => !sameMonth(refDate, today) || d >= today), "month", t("availability.appliedMonth"));

  // "Enable" on a day outside the working week, or turn it back off.
  const toggleDay = (date: string, enabled: boolean) => run(`day:${date}`, async () => {
    const id = await ensureConfigId();
    await availabilityApi.updateConfig(id, { exception: enabled ? { date, isDayOff: false, workStart, workEnd } : { date, isDayOff: true } });
  }, t("availability.dayUpdated"));

  // Switch one slot on/off: send that day's slots back with the one slot changed.
  const saveSlot = () => {
    if (!editing) return;
    const { day, index } = editing;
    const slots: AvailabilitySlot[] = day.slots.map((s, i) => (i === index ? { ...s, active: editActive } : s));
    setEditing(null);
    run(`day:${day.date}`, async () => {
      const id = await ensureConfigId();
      await availabilityApi.updateConfig(id, { exception: { date: day.date, isDayOff: false, workStart: day.workStart ?? workStart, workEnd: day.workEnd ?? workEnd, slots } });
    }, t("availability.savedSlot"));
  };

  /* ─── Render ───────────────────────────────────────────────────────────── */
  const projectPicker = (
    <Field id="avail-project" label={t("availability.project")} className="w-full sm:w-72">
      <Select id="avail-project" value={projectId} onChange={setProjectId} disabled={projectsLoading || !projects.length}>
        {!projectId && <option value="" disabled>{projectsLoading ? t("common.loading") : t("availability.projectPh")}</option>}
        {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
      </Select>
    </Field>
  );

  const header = <PageHeader title={t("availability.title")} subtitle={t("availability.subtitle")} actions={flash ? <Pill tone={flash.tone}>{flash.text}</Pill> : undefined} />;

  if (projectsLoading) return <div className="animate-rise">{header}<Card><div className="flex items-center justify-center gap-2 py-10 text-[13px] text-ink-500"><Spinner className="h-5 w-5" />{t("common.loading")}</div></Card></div>;
  if (projectsError || !projects.length) {
    return (
      <div className="animate-rise">{header}
        <Card><p role={projectsError ? "alert" : undefined} className="py-6 text-center text-[13px] text-ink-500">{projectsError ? errorText(projectsError) : t("availability.noProjects")}</p></Card>
      </div>
    );
  }

  const disabled = !!busy || configLoading;
  const dayByDate = new Map(days.map((d) => [d.date.slice(0, 10), d]));

  return (
    <div className="animate-rise">
      {header}

      {/* ── Project + config toolbar ───────────────────────────────────── */}
      <Card className="mb-4">
        <div className="mb-4 flex flex-wrap items-end gap-3 border-b border-line pb-4">
          {projectPicker}
          {configLoading && <span className="flex items-center gap-2 pb-2.5 text-[12px] text-ink-500"><Spinner className="h-4 w-4" />{t("common.loading")}</span>}
          {!configLoading && !config && !loadError && projectId && (
            <p className="flex max-w-[60ch] items-start gap-2 pb-2 text-[13px] text-warn-700"><Icons.warning className="mt-0.5 h-4 w-4 shrink-0" />{t("availability.noConfig")}</p>
          )}
        </div>
        {loadError ? (
          <div role="alert" className="flex flex-col items-center gap-3 py-6 text-center">
            <p className="max-w-[52ch] text-[13px] text-ink-700">{(loadError instanceof ApiError && loadError.localized(locale)) || t("availability.loadFailed")}</p>
            <Button variant="secondary" size="sm" onClick={() => { setConfigNonce((n) => n + 1); refreshDays(); }}>{t("projects.retry")}</Button>
          </div>
        ) : (<>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field id="startDay" label={t("availability.startDay")}>
              <Select id="startDay" value={String(startDay)} onChange={(v) => setStartDay(Number(v))} disabled={disabled}>{DAY_OPTIONS.map((d) => <option key={d} value={d}>{fmtWeekday(d, locale)}</option>)}</Select>
            </Field>
            <Field id="endDay" label={t("availability.endDay")}>
              <Select id="endDay" value={String(endDay)} onChange={(v) => setEndDay(Number(v))} disabled={disabled}>{DAY_OPTIONS.map((d) => <option key={d} value={d}>{fmtWeekday(d, locale)}</option>)}</Select>
            </Field>
            <Field id="workStart" label={t("availability.startTime")}>
              <Select id="workStart" value={workStart} onChange={setWorkStart} disabled={disabled}>{START_TIME_OPTIONS.map((x) => <option key={x} value={x}>{x}</option>)}</Select>
            </Field>
            <Field id="workEnd" label={t("availability.endTime")}>
              <Select id="workEnd" value={workEnd} onChange={setWorkEnd} disabled={disabled}>{TIME_OPTIONS.map((x) => <option key={x} value={x}>{x}</option>)}</Select>
            </Field>
          </div>
          <div className="mt-4 flex flex-wrap items-end gap-4 border-t border-line pt-4">
            <div className="pb-2.5"><Switch checked={breakEnabled} onChange={setBreakEnabled} disabled={disabled} label={t("availability.breakTime")} /></div>
            {breakEnabled && (
              <>
                <Field id="breakStart" label={t("availability.breakStart")} className="w-36"><Select id="breakStart" value={breakStart} onChange={setBreakStart} disabled={disabled}>{TIME_OPTIONS.map((x) => <option key={x} value={x}>{x}</option>)}</Select></Field>
                <Field id="breakEnd" label={t("availability.breakEnd")} className="w-36"><Select id="breakEnd" value={breakEnd} onChange={setBreakEnd} disabled={disabled}>{TIME_OPTIONS.map((x) => <option key={x} value={x}>{x}</option>)}</Select></Field>
              </>
            )}
            <div className="ms-auto flex flex-wrap gap-2">
              <Button variant="secondary" onClick={handleApplyMonth} disabled={disabled && busy !== "month"} isLoading={busy === "month"}>{t("availability.applyMonth")}</Button>
              <Button variant="secondary" onClick={handleApplyWeek} disabled={disabled && busy !== "week"} isLoading={busy === "week"}>{t("availability.applyWeek")}</Button>
              <Button onClick={handleSaveConfig} disabled={disabled && busy !== "save"} isLoading={busy === "save"} icon={config ? <Icons.check className="h-4 w-4" /> : <Icons.plus className="h-4 w-4" />}>{config ? t("availability.saveConfig") : t("availability.createConfig")}</Button>
            </div>
          </div>
        </>)}
      </Card>

      {/* ── Week strip ─────────────────────────────────────────────────── */}
      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 sm:px-5">
          <button type="button" aria-label={t("availability.prevWeek")} onClick={() => setRefDate((d) => addDays(d, -7))} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-500 hover:bg-slate-100"><Icons.back className="h-4 w-4" /></button>
          <h3 className="text-[14px] font-semibold text-ink-900">{fmtDate(weekDates[0], locale)} – {fmtDate(weekDates[6], locale)}</h3>
          <button type="button" aria-label={t("availability.nextWeek")} onClick={() => setRefDate((d) => addDays(d, 7))} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-500 hover:bg-slate-100"><Icons.chevron className="h-4 w-4" /></button>
          {daysLoading && <Spinner className="h-4 w-4 text-ink-400" />}
          <Button variant="ghost" size="sm" className="ms-auto" onClick={() => { setRefDate(today); refreshDays(); }}>{t("availability.today")}</Button>
        </div>
        <div className="scroll-x p-3 sm:p-4">
          <div className={cx("flex gap-3 transition-opacity", daysLoading && "opacity-60")} style={{ minWidth: 7 * 196 }}>
            {weekDates.map((dateKey) => {
              const day = dayByDate.get(dateKey);
              const dow = dayOfWeek(dateKey);
              // Outside the saved working week (Fri/Sat by default): the card gets an Enable switch.
              const outside = !isWithinWorkingWeek(dow, config?.startDay ?? DEFAULTS.startDay, config?.endDay ?? DEFAULTS.endDay);
              const dayOff = day?.dayOff ?? outside;
              const isToday = dateKey === today;
              const dayBusy = busy === `day:${dateKey}`;
              const saved = !!day?.hasSavedSlots;
              const activeCount = saved ? day!.slots.filter((s) => s.active).length : 0;
              return (
                <section key={dateKey} aria-label={fmtDate(dateKey, locale)} aria-busy={dayBusy}
                  className={cx("w-[184px] shrink-0 rounded-lg border bg-surface p-3", isToday ? "border-brand-600" : "border-line", outside && dayOff && "opacity-55")}>
                  <div className="flex items-center justify-between">
                    <p className="text-[13px] font-bold text-ink-900">{fmtWeekday(dow, locale)}</p>
                    {dayBusy ? <Spinner className="h-4 w-4 text-brand-600" /> : isToday && <Pill tone="brand">{t("availability.today")}</Pill>}
                  </div>
                  <p className="text-[12px] text-ink-500">{fmtDate(dateKey, locale)}</p>
                  {dayOff
                    ? <p className="mt-1 text-[12px] text-ink-400">{outside ? t("availability.outsideRange") : t("availability.dayOff")}</p>
                    : <p className={cx("text-[12px]", saved ? "font-medium text-brand-700" : "text-ink-500")}>{day?.workStart ?? workStart} – {day?.workEnd ?? workEnd}</p>}

                  {outside && <div className="mt-2"><Switch size="sm" checked={!dayOff} disabled={!!busy} onChange={(v) => toggleDay(dateKey, v)} label={t("availability.enable")} /></div>}

                  {!dayOff ? (
                    <>
                      <Button variant="ghost" size="sm" className="mt-2 w-full" disabled={!!busy} icon={<Icons.plus className="h-3.5 w-3.5" />} onClick={() => handleGenerateDay(dateKey)}>{t("availability.generateSlots")}</Button>
                      {!saved
                        ? <p className="mt-2 text-[12px] text-ink-400">{t("availability.noSlots")}</p>
                        : <p className="mt-2 text-[11px] tabular-nums text-ink-400">{t("availability.slotsCount", { n: day!.slots.length, active: activeCount })}</p>}
                      {saved && (
                        <div className="mt-1.5 max-h-[360px] space-y-1 overflow-y-auto pe-0.5">
                          {day!.slots.map((slot, i) => (
                            <button key={`${slot.start}-${i}`} type="button" disabled={!!busy} onClick={() => { setEditing({ day: day!, index: i }); setEditActive(slot.active); }}
                              aria-label={`${slot.start} – ${slot.end}: ${slot.active ? t("availability.active") : t("availability.inactive")}`}
                              className={cx("flex w-full items-center justify-between rounded-md px-2 py-1 text-[12px] tabular-nums transition-colors disabled:opacity-60", slot.active ? "bg-ok-50 text-ok-700 hover:ring-1 hover:ring-ok-600/40" : "border border-dashed border-ink-300 text-ink-400 hover:bg-slate-50")}>
                              <span>{slot.start} – {slot.end}</span>
                              {slot.active ? <Icons.check className="h-3.5 w-3.5" /> : <Icons.x className="h-3.5 w-3.5" />}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  ) : !outside && (
                    <p className="mt-4 text-[13px] text-ink-500">{t("availability.dayOff")}</p>
                  )}
                </section>
              );
            })}
          </div>
        </div>
        <ul className="flex flex-wrap gap-4 border-t border-line px-4 py-2.5 text-[12px] text-ink-500 sm:px-5" aria-label="Legend">
          <li className="flex items-center gap-1.5"><span className="inline-block h-3 w-5 rounded bg-ok-50 ring-1 ring-ok-600/30" aria-hidden />{t("availability.legendActive")}</li>
          <li className="flex items-center gap-1.5"><span className="inline-block h-3 w-5 rounded border border-dashed border-ink-300" aria-hidden />{t("availability.legendInactive")}</li>
        </ul>
      </Card>

      {/* ── Switch one slot on/off ─────────────────────────────────────── */}
      <Modal open={!!editing} title={t("availability.editSlot")} subtitle={editing ? `${fmtDate(editing.day.date.slice(0, 10), locale)} · ${editing.day.slots[editing.index]?.start} – ${editing.day.slots[editing.index]?.end}` : undefined} onClose={() => setEditing(null)}
        actions={<><Button variant="secondary" onClick={() => setEditing(null)}>{t("common.cancel")}</Button><Button onClick={saveSlot}>{t("common.save")}</Button></>}>
        <Switch checked={editActive} onChange={setEditActive} label={t("availability.active")} />
      </Modal>
    </div>
  );
}
