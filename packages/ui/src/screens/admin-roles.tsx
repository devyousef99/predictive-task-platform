"use client";
import { useEffect, useState } from "react";
import { DEFAULT_ROLE_MATRIX, ORG_PERMISSIONS, ORG_ROLES, ORG_ROLE_DEFINITIONS, PERMISSION_GROUPS, PROJECT_ROLES, cloneRoleMatrix, roleMatrixDiff, roleMatrixEquals, toggleRoleMatrix, type OrgRole, type Permission, type ProjectRole, type RoleMatrix } from "@ptp/rbac";
import { useApp, useRoleMatrix, useSession, useT } from "../context";
import { Button, Card, Icons, PageHeader, Pill, cx } from "../primitives";
import { MatrixRows } from "./roles";

/**
 * Admin-only editor for the role → permission matrix. Edits live in a local draft until
 * saved; the host persists the saved matrix and every `useCan()` consumer re-evaluates.
 */
export function AdminRolesScreen() {
  const { t } = useT();
  const { setRoleMatrix } = useApp();
  const session = useSession();
  const saved = useRoleMatrix();
  const [tab, setTab] = useState<"project" | "org">("project");
  const [draft, setDraft] = useState<RoleMatrix>(() => cloneRoleMatrix(saved));
  const [savedFlash, setSavedFlash] = useState(false);

  // Re-sync the draft whenever the host's saved matrix changes (after Save, or another tab).
  useEffect(() => { setDraft(cloneRoleMatrix(saved)); }, [saved]);
  useEffect(() => {
    if (!savedFlash) return;
    const id = setTimeout(() => setSavedFlash(false), 2500);
    return () => clearTimeout(id);
  }, [savedFlash]);

  const acting = session.principal.defaultRole;
  const orgRole = session.principal.orgRole;
  const dirty = !roleMatrixEquals(draft, saved);
  const changes = roleMatrixDiff(draft, saved);
  const draftIsDefault = roleMatrixEquals(draft, DEFAULT_ROLE_MATRIX);
  const savedIsDefault = roleMatrixEquals(saved, DEFAULT_ROLE_MATRIX);

  /** An admin must never lock themselves out of this screen. */
  const isLocked = (scope: keyof RoleMatrix) => (role: string, p: Permission) => scope === "org" && role === orgRole && p === "org.settings.manage";
  const isChanged = (scope: keyof RoleMatrix) => (role: string, p: Permission) =>
    (draft[scope] as Record<string, Permission[]>)[role].includes(p) !== (saved[scope] as Record<string, Permission[]>)[role].includes(p);
  const toggle = (scope: keyof RoleMatrix) => (role: string, p: Permission) => {
    if (isLocked(scope)(role, p)) return;
    setDraft((d) => toggleRoleMatrix(d, scope, role as ProjectRole | OrgRole, p));
  };

  const save = () => { setRoleMatrix?.(draft); setSavedFlash(true); };
  const discard = () => setDraft(cloneRoleMatrix(saved));
  const reset = () => setDraft(cloneRoleMatrix(DEFAULT_ROLE_MATRIX));

  return (
    <div className="animate-rise">
      <PageHeader
        title={t("admin.title")}
        subtitle={t("admin.subtitle")}
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={reset} disabled={draftIsDefault}>{t("admin.resetDefaults")}</Button>
            <Button variant="secondary" size="sm" onClick={discard} disabled={!dirty}>{t("admin.discard")}</Button>
            <Button size="sm" onClick={save} disabled={!dirty || !setRoleMatrix}>{t("common.save")}</Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div role="tablist" className="inline-flex rounded-md border border-line bg-surface p-0.5">
          {(["project", "org"] as const).map((v) => (
            <button key={v} role="tab" aria-selected={tab === v} type="button" onClick={() => setTab(v)} className={cx("h-8 rounded px-3 text-[13px] font-medium", tab === v ? "bg-brand-50 text-brand-700" : "text-ink-500 hover:text-ink-900")}>
              {v === "project" ? t("roles.projectRoles") : t("roles.orgRoles")}
            </button>
          ))}
        </div>
        <div className="ms-auto flex items-center gap-2" aria-live="polite">
          {savedFlash && <Pill tone="ok">{t("admin.saved")}</Pill>}
          {dirty
            ? <Pill tone="warn">{t("admin.unsaved")} · {t("admin.changes", { n: changes })}</Pill>
            : <Pill tone={savedIsDefault ? "neutral" : "brand"}>{savedIsDefault ? t("admin.matchesDefaults") : t("admin.customized")}</Pill>}
        </div>
      </div>

      <Card padded={false}>
        <div className="scroll-x">
          {tab === "project" ? (
            <table className="w-full min-w-[720px] border-collapse text-[13px]">
              <thead>
                <tr className="bg-slate-50">
                  <th scope="col" className="sticky start-0 z-10 bg-slate-50 px-4 py-2.5 text-start text-[12px] font-medium uppercase tracking-wide text-ink-500 sm:ps-5">{t("roles.permission")}</th>
                  {PROJECT_ROLES.map((r) => (
                    <th key={r} scope="col" className={cx("px-3 py-2.5 text-center text-[12px] font-medium", acting === r ? "text-brand-700" : "text-ink-700")}>
                      {t(`roles.${r}`)}
                      <span className="mt-0.5 block text-[11px] font-normal tabular-nums text-ink-400">{draft.project[r].length}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PERMISSION_GROUPS.map((g) => (
                  <MatrixRows key={g.id} label={g.label} permissions={g.permissions} roles={PROJECT_ROLES} acting={acting}
                    has={(r, p) => draft.project[r as ProjectRole].includes(p)}
                    onToggle={toggle("project")} isChanged={isChanged("project")} isLocked={isLocked("project")} />
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full min-w-[640px] border-collapse text-[13px]">
              <thead>
                <tr className="bg-slate-50">
                  <th scope="col" className="sticky start-0 z-10 bg-slate-50 px-4 py-2.5 text-start text-[12px] font-medium uppercase tracking-wide text-ink-500 sm:ps-5">{t("roles.permission")}</th>
                  {ORG_ROLES.map((r) => (
                    <th key={r} scope="col" className={cx("px-3 py-2.5 text-center text-[12px] font-medium", orgRole === r ? "text-brand-700" : "text-ink-700")}>
                      {ORG_ROLE_DEFINITIONS[r].name}
                      <span className="mt-0.5 block text-[11px] font-normal tabular-nums text-ink-400">{draft.org[r].length}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <MatrixRows label="Organization" permissions={ORG_PERMISSIONS} roles={ORG_ROLES} acting={orgRole}
                  has={(r, p) => draft.org[r as OrgRole].includes(p)}
                  onToggle={toggle("org")} isChanged={isChanged("org")} isLocked={isLocked("org")} lockedTitle={t("admin.lockedSelf")} />
              </tbody>
            </table>
          )}
        </div>
      </Card>

      <div className="mt-3 flex flex-col gap-2 text-[12px] text-ink-500 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2"><Icons.spark className="h-4 w-4 shrink-0 text-brand-500" />{t("admin.hint")}</p>
        <ul className="flex items-center gap-4" aria-label="Legend">
          <li className="flex items-center gap-1.5"><span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-ok-50 text-ok-700"><Icons.check className="h-3 w-3" /></span>{t("admin.legendGranted")}</li>
          <li className="flex items-center gap-1.5"><span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-dashed border-ink-300" aria-hidden />{t("admin.legendDenied")}</li>
          <li className="flex items-center gap-1.5"><span className="inline-flex h-4 w-4 rounded ring-2 ring-brand-600/50" aria-hidden />{t("admin.legendChanged")}</li>
        </ul>
      </div>
    </div>
  );
}
