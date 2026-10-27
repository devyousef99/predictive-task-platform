"use client";
import { useEffect, useState } from "react";
import { ApiError, rolesApi, toProjectRole, usersApi, type ApiRole, type CreatedUser } from "@ptp/api";
import { ORG_ROLE_DEFINITIONS, type ProjectRole } from "@ptp/rbac";
import { useApiUsers } from "../api-users";
import { useCan, useSession, useT } from "../context";
import { initialsOf, isValidEmail, orgRoleFor, type User } from "../models";
import { Avatar, Button, Card, Field, Icons, Input, Modal, PageHeader, Pill, Select, Spinner } from "../primitives";

/** Team directory, bound to GET /admin/users/getAllUsers. */
export function TeamScreen() {
  const { t, locale } = useT();
  const session = useSession();
  const can = useCan();
  const canManage = can("org.members.manage");
  const { users, loading, error, reload } = useApiUsers();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => { if (!flash) return; const id = setTimeout(() => setFlash(null), 2500); return () => clearTimeout(id); }, [flash]);

  const q = query.trim().toLowerCase();
  const visible = q ? users.filter((u) => `${u.name} ${u.email} ${u.jobTitle ?? ""}`.toLowerCase().includes(q)) : users;
  const isYou = (id: string, email: string) => id === session.user.id || email.toLowerCase() === session.user.email.toLowerCase();
  const roleOf = (u: (typeof users)[number]) => (u.raw.role ? (locale === "ar" && u.raw.role.roleAr) || u.raw.role.role : "—");
  const statusOf = (u: (typeof users)[number]) => (u.raw.status ?? "active").toLowerCase();
  const known: User[] = users.map((u) => ({ id: u.id, name: u.name, email: u.email, initials: u.initials, capacity: 1 }));

  return (
    <div className="animate-rise">
      <PageHeader title={t("team.title")} subtitle={t("team.subtitle")}
        actions={<>{flash && <Pill tone="ok">{flash}</Pill>}{canManage && <Button icon={<Icons.plus className="h-4 w-4" />} onClick={() => setOpen(true)}>{t("team.addUser")}</Button>}</>} />

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-[360px]">
          <span className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3 text-ink-400"><Icons.search className="h-4 w-4" /></span>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("team.search")} aria-label={t("team.search")}
            className="h-9 w-full rounded-md border border-line bg-surface ps-9 pe-3 text-[13px] placeholder:text-ink-400 focus:border-brand-600 focus:shadow-focus" />
        </div>
        <span className="text-[12px] tabular-nums text-ink-500">{t("team.count", { n: visible.length })}</span>
        {!canManage && <span className="ms-auto text-[12px] text-ink-400">{t("team.noAccess")}</span>}
      </div>

      <Card padded={false}>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-[13px] text-ink-500"><Spinner className="h-5 w-5" />{t("users.loading")}</div>
        ) : error ? (
          <div role="alert" className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="max-w-[48ch] text-[13px] text-ink-700">{(error instanceof ApiError && error.localized(locale)) || t("users.loadFailed")}</p>
            <Button variant="secondary" size="sm" onClick={reload}>{t("projects.retry")}</Button>
          </div>
        ) : (
          <div className="scroll-x">
            <table className="w-full min-w-[680px] text-[13px]">
              <thead className="bg-slate-50 text-[12px] uppercase tracking-wide text-ink-500">
                <tr>
                  {[t("team.member"), t("users.role"), t("team.projects"), t("team.status")].map((h, i) => (
                    <th key={i} scope="col" className="px-4 py-2.5 text-start font-medium first:ps-5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {visible.map((u, i) => (
                  <tr key={u.id} className="transition-colors hover:bg-slate-50">
                    <td className="px-4 py-3 first:ps-5">
                      <div className="flex items-center gap-3">
                        <Avatar initials={u.initials} name={u.name} size={32} index={i} />
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 font-medium text-ink-900"><span className="truncate">{u.name}</span>{isYou(u.id, u.email) && <Pill tone="brand">{t("common.you")}</Pill>}</p>
                          <p className="truncate text-[12px] text-ink-500">{u.email}{u.jobTitle && ` · ${u.jobTitle}`}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-ink-700">{roleOf(u)}</td>
                    <td className="px-4 py-3 tabular-nums text-ink-700">{Array.isArray(u.raw.projectRoles) ? u.raw.projectRoles.length : 0}</td>
                    <td className="px-4 py-3"><Pill tone={statusOf(u) === "active" ? "ok" : "warn"}>{statusOf(u) === "active" ? t("team.active") : u.raw.status}</Pill></td>
                  </tr>
                ))}
                {visible.length === 0 && <tr><td colSpan={4} className="px-5 py-8 text-center text-ink-500">{t("team.empty")}</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {canManage && <AddUserDialog open={open} users={known} onClose={() => setOpen(false)} onAdd={() => { setOpen(false); setFlash(t("team.added")); reload(); }} />}
    </div>
  );
}
export function AddUserDialog({ open, users, onClose, onAdd }: { open: boolean; users: User[]; onClose: () => void; onAdd: (u: User) => void }) {
  const { t, locale } = useT();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const [roles, setRoles] = useState<ApiRole[] | null>(null);
  const [rolesError, setRolesError] = useState(false);
  const [roleId, setRoleId] = useState("");
  const [errors, setErrors] = useState<{ name?: string; email?: string; role?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);

  // Role list comes from GET admin/role/getAllRoles each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    setRoles(null); setRolesError(false);
    rolesApi.getAllRoles(ctrl.signal)
      .then((list) => {
        setRoles(list);
        // Default to the contributor role when it exists, else the first one.
        setRoleId((cur) => cur || (list.find((r) => toProjectRole(r.key) === "contributor") ?? list[0])?._id || "");
      })
      .catch((err: unknown) => { if ((err as Error)?.name !== "AbortError") setRolesError(true); });
    return () => ctrl.abort();
  }, [open]);

  const selected = roles?.find((r) => r._id === roleId);
  // The local user model stores an app role; map the API role's key onto it.
  const role: ProjectRole = selected ? toProjectRole(selected.key) : "contributor";
  const roleLabel = (r: ApiRole) => (locale === "ar" && r.roleAr) || r.role;

  const reset = () => { setName(""); setEmail(""); setTitle(""); setRoleId(""); setErrors({}); setBusy(false); };
  const close = () => { if (busy) return; reset(); onClose(); };
  const submit = async () => {
    if (busy) return;
    const e: typeof errors = {};
    if (!name.trim()) e.name = t("team.required");
    if (!email.trim()) e.email = t("team.required");
    else if (!isValidEmail(email)) e.email = t("team.emailInvalid");
    else if (users.some((u) => u.email.toLowerCase() === email.trim().toLowerCase())) e.email = t("team.emailExists");
    if (!selected) e.role = t("team.required");
    if (Object.keys(e).length || !selected) { setErrors(e); return; }

    // POST /admin/users/createUser with the selected role's _id.
    setBusy(true);
    let created: CreatedUser | null;
    try {
      created = await usersApi.createUser({ fullName: name.trim(), email: email.trim().toLowerCase(), jobTitle: title.trim() || undefined, role: selected._id });
    } catch (err) {
      setErrors({ form: (err instanceof ApiError && err.localized(locale)) || t("team.createFailed") });
      setBusy(false);
      return;
    }
    // Keep the local team list in sync (the user's backend id when returned).
    const id = String(created?._id ?? created?.id ?? `u_${Date.now().toString(36)}`);
    onAdd({ id, name: name.trim(), email: email.trim().toLowerCase(), initials: initialsOf(name), capacity: 1, title: title.trim() || undefined, defaultRole: role, orgRole: orgRoleFor(role), invited: true });
    reset();
  };

  return (
    <Modal open={open} title={t("team.addUser")} onClose={close}
      actions={<><Button variant="secondary" onClick={close} disabled={busy}>{t("common.cancel")}</Button><Button onClick={submit} isLoading={busy} disabled={!roles?.length} icon={<Icons.plus className="h-4 w-4" />}>{t("team.createUser")}</Button></>}>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-4">
        {errors.form && (
          <p role="alert" className="flex items-start gap-2 rounded-md border border-danger-600/30 bg-danger-50 px-3 py-2.5 text-[13px] text-danger-700"><Icons.warning className="mt-0.5 h-4 w-4 shrink-0" />{errors.form}</p>
        )}
        <div className="flex items-center gap-3">
          <Avatar initials={initialsOf(name || "?")} name={name || "?"} size={40} />
          <div className="flex-1"><Input name="newUserName" label={t("team.name")} placeholder={t("team.namePh")} value={name} maxLength={80} autoFocus onChange={(e) => { setName(e.target.value); setErrors({}); }} error={errors.name} /></div>
        </div>
        <Input name="newUserEmail" type="email" label={t("team.email")} placeholder={t("team.emailPh")} value={email} maxLength={120} onChange={(e) => { setEmail(e.target.value); setErrors({}); }} error={errors.email} />
        <Input name="newUserTitle" label={t("team.jobTitle")} placeholder={t("team.jobTitlePh")} value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} />
        <Field id="newUserRole" label={t("users.role")} error={errors.role ?? (rolesError ? t("team.rolesFailed") : undefined)}
          hint={selected ? (selected.description || `${t("team.orgRole")}: ${ORG_ROLE_DEFINITIONS[orgRoleFor(role)].name}`) : undefined}>
          <Select id="newUserRole" value={roleId} onChange={(v) => { setRoleId(v); setErrors((x) => ({ ...x, role: undefined })); }} disabled={!roles?.length}>
            {!roles && !rolesError && <option value="">{t("common.loading")}</option>}
            {roles?.length === 0 && <option value="">{t("team.noRoles")}</option>}
            {roles?.map((r) => <option key={r._id} value={r._id}>{roleLabel(r)}</option>)}
          </Select>
        </Field>
        <button type="submit" hidden aria-hidden />
      </form>
    </Modal>
  );
}
