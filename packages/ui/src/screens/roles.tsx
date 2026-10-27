"use client";
import { useCallback, useEffect, useState } from "react";
import { ApiError, permissionsApi, type MatrixPermission, type MatrixRole, type PermissionMatrix } from "@ptp/api";
import { PERMISSION_LABELS, type Permission } from "@ptp/rbac";
import { useSession, useT } from "../context";
import { Button, Card, Icons, PageHeader, Pill, Spinner, cx } from "../primitives";

/**
 * Roles & permissions, bound to /admin/permissions:
 *   GET   /matrix              → role cards + role × permission table
 *   PATCH /roles/:roleId       → tick / untick one cell (super admin only; others get 403)
 */
export function RoleMatrixScreen() {
  const { t, locale } = useT();
  const session = useSession();
  const canEdit = !!session.principal.superAdmin;
  const [matrix, setMatrix] = useState<PermissionMatrix | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [nonce, setNonce] = useState(0);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    const ctrl = new AbortController();
    setError(null);
    permissionsApi.getMatrix(ctrl.signal)
      .then((data) => { console.log("[roles] matrix", data); setMatrix(data); })
      .catch((err: unknown) => { if ((err as Error)?.name !== "AbortError") setError(err); });
    return () => ctrl.abort();
  }, [nonce]);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(id);
  }, [notice]);

  const roleName = (r: MatrixRole) => (locale === "ar" && r.roleAr) || r.role;
  const isYou = (r: MatrixRole) => !!r.isCurrentUser || (!!matrix?.currentRoleId && r._id === matrix.currentRoleId);

  /** Sets one role's column from the keys the server returned (or the optimistic guess). */
  const applyColumn = (m: PermissionMatrix, roleId: string, keys: Set<string>): PermissionMatrix => ({
    ...m,
    roles: m.roles.map((r) => (r._id === roleId ? { ...r, permissionCount: keys.size } : r)),
    groups: m.groups.map((g) => ({
      ...g,
      permissions: g.permissions.map((p) => {
        const has = p.roleIds.includes(roleId);
        if (has === keys.has(p.key)) return p;
        return { ...p, roleIds: has ? p.roleIds.filter((x) => x !== roleId) : [...p.roleIds, roleId] };
      }),
    })),
  });
  const keysOf = (m: PermissionMatrix, roleId: string) => new Set(m.groups.flatMap((g) => g.permissions.filter((p) => p.roleIds.includes(roleId)).map((p) => p.key)));

  const toggle = (role: MatrixRole, perm: MatrixPermission) => {
    if (!matrix || !canEdit) return;
    const cell = `${role._id}:${perm.key}`;
    if (pending.has(cell)) return;
    const granted = !perm.roleIds.includes(role._id);
    const previous = matrix;
    const optimistic = keysOf(matrix, role._id);
    if (granted) optimistic.add(perm.key); else optimistic.delete(perm.key);
    setMatrix(applyColumn(matrix, role._id, optimistic));
    setPending((s) => new Set(s).add(cell));

    permissionsApi.setPermission(role._id, perm.key, granted)
      .then((res) => {
        if (Array.isArray(res?.permissionKeys)) setMatrix((m) => (m ? applyColumn(m, role._id, new Set(res.permissionKeys)) : m));
      })
      .catch((err: unknown) => {
        setMatrix(previous);
        setNotice(err instanceof ApiError && err.status === 403 ? t("roles.forbidden") : (err instanceof ApiError && err.localized(locale)) || t("roles.saveFailed"));
      })
      .finally(() => setPending((s) => { const next = new Set(s); next.delete(cell); return next; }));
  };

  return (
    <div className="animate-rise">
      <PageHeader title={t("roles.matrixTitle")} subtitle={t("roles.matrixSubtitle")} actions={notice ? <Pill tone="warn">{notice}</Pill> : undefined} />

      {!matrix && !error && (
        <Card><div className="flex items-center justify-center gap-2 py-10 text-[13px] text-ink-500"><Spinner className="h-5 w-5" />{t("roles.loading")}</div></Card>
      )}
      {!matrix && !!error && (
        <Card>
          <div role="alert" className="flex flex-col items-center gap-3 py-8 text-center">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-danger-50 text-danger-700"><Icons.warning className="h-5 w-5" /></span>
            <p className="max-w-[48ch] text-[13px] text-ink-700">{(error instanceof ApiError && error.localized(locale)) || t("roles.loadFailed")}</p>
            <Button variant="secondary" size="sm" onClick={reload}>{t("projects.retry")}</Button>
          </div>
        </Card>
      )}

      {matrix && (
        <>
          {/* Role cards */}
          <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {matrix.roles.map((r) => {
              const you = isYou(r);
              return (
                <div key={r._id} className={cx("rounded-lg border bg-surface p-4 shadow-card", you ? "border-brand-600 ring-2 ring-brand-600/20" : "border-transparent")}>
                  <div className="flex items-center justify-between gap-2"><p className="font-semibold text-ink-900">{roleName(r)}</p>{you && <Pill tone="brand">{t("common.you")}</Pill>}</div>
                  {r.description && <p className="mt-1 text-[12px] leading-relaxed text-ink-500">{r.description}</p>}
                  <p className="mt-2 text-[12px] font-medium tabular-nums text-brand-700">{t("roles.permissionsCount", { n: r.permissionCount, total: matrix.totalPermissions })}</p>
                </div>
              );
            })}
          </div>

          {/* Role × permission table */}
          <Card padded={false}>
            <div className="scroll-x">
              <table className="w-full min-w-[720px] border-collapse text-[13px]">
                <thead>
                  <tr className="bg-slate-50">
                    <th scope="col" className="sticky start-0 z-10 bg-slate-50 px-4 py-2.5 text-start text-[12px] font-medium uppercase tracking-wide text-ink-500 sm:ps-5">{t("roles.permission")}</th>
                    {matrix.roles.map((r) => (
                      <th key={r._id} scope="col" className={cx("px-3 py-2.5 text-center text-[12px] font-medium", isYou(r) ? "text-brand-700" : "text-ink-700")}>{roleName(r)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrix.groups.map((g) => (
                    <ApiMatrixGroup key={g.key} label={g.label} permissions={g.permissions} roles={matrix.roles} isYou={isYou}
                      roleName={roleName} canEdit={canEdit} pending={pending} onToggle={toggle} />
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <p className="mt-3 flex items-center gap-2 text-[12px] text-ink-500">
            <Icons.spark className="h-4 w-4 text-brand-500" />
            {canEdit ? t("roles.editHint") : t("roles.viewOnly")}
          </p>
        </>
      )}
    </div>
  );
}

/** One permission group of the API matrix; cells are switches for the super admin. */
function ApiMatrixGroup({ label, permissions, roles, isYou, roleName, canEdit, pending, onToggle }: {
  label: string; permissions: MatrixPermission[]; roles: MatrixRole[]; isYou: (r: MatrixRole) => boolean; roleName: (r: MatrixRole) => string;
  canEdit: boolean; pending: Set<string>; onToggle: (role: MatrixRole, perm: MatrixPermission) => void;
}) {
  const { t, locale } = useT();
  return (
    <>
      <tr><th colSpan={roles.length + 1} scope="colgroup" className="sticky start-0 bg-surface px-4 pb-1 pt-4 text-start text-[11px] font-semibold uppercase tracking-wide text-ink-400 sm:ps-5">{label}</th></tr>
      {permissions.map((p) => {
        const name = (locale === "ar" && p.nameAr) || p.name;
        return (
          <tr key={p._id} className="border-t border-line hover:bg-slate-50/60">
            <th scope="row" className="sticky start-0 bg-surface px-4 py-2.5 text-start font-normal text-ink-900 sm:ps-5">{name}<span className="ms-2 hidden font-mono text-[11px] text-ink-400 lg:inline">{p.key}</span></th>
            {roles.map((r) => {
              const ok = p.roleIds.includes(r._id);
              const busy = pending.has(`${r._id}:${p.key}`);
              const face = cx("inline-flex h-6 w-6 items-center justify-center rounded-full", ok ? "bg-ok-50 text-ok-700" : "text-ink-300");
              const state = ok ? t("roles.allowed") : t("roles.denied");
              return (
                <td key={r._id} className={cx("px-3 py-2.5 text-center", isYou(r) && "bg-brand-50/50")}>
                  {canEdit ? (
                    <button type="button" role="switch" aria-checked={ok} aria-busy={busy} disabled={busy}
                      aria-label={`${name} — ${roleName(r)}: ${state}`} onClick={() => onToggle(r, p)}
                      className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md transition-colors duration-150 hover:bg-slate-100 disabled:cursor-wait">
                      <span className={cx(face, !ok && "border border-dashed border-ink-300")}>
                        {busy ? <Spinner className="h-3.5 w-3.5" /> : ok ? <Icons.check className="h-4 w-4" /> : <span aria-hidden>—</span>}
                      </span>
                    </button>
                  ) : (
                    <span aria-label={state} className={face}>{ok ? <Icons.check className="h-4 w-4" /> : <span aria-hidden>—</span>}</span>
                  )}
                </td>
              );
            })}
          </tr>
        );
      })}
    </>
  );
}

/**
 * One permission group inside a role × permission table. Read-only by default; pass
 * `onToggle` to turn every cell into a switch (used by the Admin screen).
 */
export function MatrixRows({ label, permissions, roles, has, acting, onToggle, isLocked, isChanged, lockedTitle }: {
  label: string;
  permissions: readonly Permission[];
  roles: readonly string[];
  has: (role: string, p: Permission) => boolean;
  acting?: string;
  onToggle?: (role: string, p: Permission) => void;
  isLocked?: (role: string, p: Permission) => boolean;
  isChanged?: (role: string, p: Permission) => boolean;
  lockedTitle?: string;
}) {
  const { t } = useT();
  return (
    <>
      <tr><th colSpan={roles.length + 1} scope="colgroup" className="sticky start-0 bg-surface px-4 pb-1 pt-4 text-start text-[11px] font-semibold uppercase tracking-wide text-ink-400 sm:ps-5">{label}</th></tr>
      {permissions.map((p) => (
        <tr key={p} className="border-t border-line hover:bg-slate-50/60">
          <th scope="row" className="sticky start-0 bg-surface px-4 py-2.5 text-start font-normal text-ink-900 sm:ps-5">{PERMISSION_LABELS[p]}<span className="ms-2 hidden font-mono text-[11px] text-ink-400 lg:inline">{p}</span></th>
          {roles.map((r) => {
            const ok = has(r, p);
            const changed = isChanged?.(r, p) ?? false;
            const locked = isLocked?.(r, p) ?? false;
            const face = cx("inline-flex h-6 w-6 items-center justify-center rounded-full", ok ? "bg-ok-50 text-ok-700" : "text-ink-300");
            return (
              <td key={r} className={cx("px-3 py-2.5 text-center", acting === r && "bg-brand-50/50")}>
                {onToggle ? (
                  <button type="button" role="switch" aria-checked={ok} disabled={locked} title={locked ? lockedTitle : undefined}
                    aria-label={`${PERMISSION_LABELS[p]} — ${r}: ${ok ? t("roles.allowed") : t("roles.denied")}`}
                    onClick={() => onToggle(r, p)}
                    className={cx("inline-flex h-8 w-8 items-center justify-center rounded-md transition-[box-shadow,background-color] duration-150",
                      changed ? "ring-2 ring-brand-600/50 bg-brand-50/60" : "hover:bg-slate-100",
                      locked ? "cursor-not-allowed opacity-60" : "cursor-pointer")}>
                    <span className={cx(face, !ok && !locked && "border border-dashed border-ink-300")}>
                      {ok ? <Icons.check className="h-4 w-4" /> : locked ? <Icons.lock className="h-3.5 w-3.5" /> : <span aria-hidden>—</span>}
                    </span>
                  </button>
                ) : (
                  <span aria-label={ok ? t("roles.allowed") : t("roles.denied")} className={face}>
                    {ok ? <Icons.check className="h-4 w-4" /> : <span aria-hidden>—</span>}
                  </span>
                )}
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
