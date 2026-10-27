"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, useAuthStore, usersApi, type ApiUser, type UsersPage } from "@ptp/api";
import { useSession, useT } from "../context";
import { initialsOf, type User } from "../models";
import { Avatar, Button, Card, Icons, PageHeader, Pill, Spinner, cx } from "../primitives";
import { AddUserDialog } from "./team";

const PAGE_SIZE = 10;

/**
 * User management, bound to GET /admin/users/getAllUsers?pageNo&pageSize.
 * Each row shows the user's role and one chip per entry in `projectRoles`.
 */
export function UsersAdminScreen() {
  const { t, locale } = useT();
  const session = useSession();
  const myId = useAuthStore((s) => s.user?.id);
  const [pageNo, setPageNo] = useState(1);
  const [page, setPage] = useState<UsersPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [nonce, setNonce] = useState(0);
  const [open, setOpen] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true); setError(null);
    usersApi.getAllUsers(pageNo, PAGE_SIZE, ctrl.signal)
      .then((p) => { console.log("[users] getAllUsers", p); setPage(p); })
      .catch((err: unknown) => { if ((err as Error)?.name !== "AbortError") setError(err); })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
    return () => ctrl.abort();
  }, [pageNo, nonce]);

  useEffect(() => { if (!flash) return; const id = setTimeout(() => setFlash(null), 2500); return () => clearTimeout(id); }, [flash]);

  const users = page?.users ?? [];
  const q = query.trim().toLowerCase();
  // The endpoint has no search parameter, so search filters the loaded page.
  const visible = useMemo(() => (q ? users.filter((u) => `${u.fullName} ${u.email} ${u.jobTitle ?? ""}`.toLowerCase().includes(q)) : users), [users, q]);
  const totalPages = page?.total != null ? Math.max(1, Math.ceil(page.total / PAGE_SIZE)) : null;
  const hasNext = totalPages != null ? pageNo < totalPages : users.length === PAGE_SIZE;
  const isMe = (u: ApiUser) => (!!myId && u._id === myId) || u.email.toLowerCase() === session.user.email.toLowerCase();
  const roleName = (r: { role: string; roleAr?: string | null }) => (locale === "ar" && r.roleAr) || r.role;
  // AddUserDialog checks for duplicate emails against this list.
  const knownUsers: User[] = users.map((u) => ({ id: u._id, name: u.fullName, email: u.email, initials: initialsOf(u.fullName), capacity: 1, orgRole: "org_member" }));

  return (
    <div className="animate-rise">
      <PageHeader title={t("users.title")} subtitle={t("users.subtitle")}
        actions={<>{flash && <Pill tone="ok">{flash}</Pill>}<Button icon={<Icons.plus className="h-4 w-4" />} onClick={() => setOpen(true)}>{t("team.addUser")}</Button></>} />

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-[360px]">
          <span className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3 text-ink-400"><Icons.search className="h-4 w-4" /></span>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("team.search")} aria-label={t("team.search")} title={t("users.searchPageHint")}
            className="h-9 w-full rounded-md border border-line bg-surface ps-9 pe-3 text-[13px] placeholder:text-ink-400 focus:border-brand-600 focus:shadow-focus" />
        </div>
        <span className="text-[12px] tabular-nums text-ink-500">{t("team.count", { n: page?.total ?? visible.length })}</span>
        {loading && page && <Spinner className="h-4 w-4 text-ink-400" />}
        <span className="ms-auto hidden text-[12px] text-ink-400 md:inline">{t("users.legend")}</span>
      </div>

      <Card padded={false}>
        {!page && loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-[13px] text-ink-500"><Spinner className="h-5 w-5" />{t("users.loading")}</div>
        ) : !page && error ? (
          <div role="alert" className="flex flex-col items-center gap-3 py-8 text-center">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-danger-50 text-danger-700"><Icons.warning className="h-5 w-5" /></span>
            <p className="max-w-[48ch] text-[13px] text-ink-700">{(error instanceof ApiError && error.localized(locale)) || t("users.loadFailed")}</p>
            <Button variant="secondary" size="sm" onClick={reload}>{t("projects.retry")}</Button>
          </div>
        ) : (
          <ul className={cx("divide-y divide-line transition-opacity", loading && "opacity-60")}>
            {visible.map((u, i) => {
              const you = isMe(u);
              const inactive = !!u.status && u.status.toLowerCase() !== "active";
              const chips = Array.isArray(u.projectRoles) ? u.projectRoles : [];
              return (
                <li key={u._id}>
                  <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                    <Avatar initials={initialsOf(u.fullName || u.email)} name={u.fullName} size={36} index={i} />
                    <div className="min-w-0 flex-1 basis-[200px]">
                      <p className="flex items-center gap-2 font-medium text-ink-900">
                        <span className="truncate">{u.fullName}</span>
                        {you && <Pill tone="brand">{t("common.you")}</Pill>}
                        {inactive && <Pill tone="warn">{u.status}</Pill>}
                      </p>
                      <p className="truncate text-[12px] text-ink-500">{u.email}{u.jobTitle && ` · ${u.jobTitle}`}</p>
                    </div>
                    <div className="w-56">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{t("users.role")}</p>
                      <p className={cx("text-[13px]", u.role ? "font-medium text-ink-900" : "text-ink-400")}>{u.role ? roleName(u.role) : t("users.noRoleAssigned")}</p>
                    </div>
                    <div className="hidden min-w-0 flex-1 basis-[220px] flex-wrap gap-1 lg:flex">
                      {chips.length === 0
                        ? <span className="text-[12px] text-ink-400">{t("users.noProjects")}</span>
                        : chips.map((pr) => (
                          <Pill key={pr.projectId} tone={pr.isOwner ? "brand" : "neutral"}>
                            <span className="max-w-[160px] truncate">{pr.projectTitle}</span>&nbsp;· {pr.role}
                          </Pill>
                        ))}
                    </div>
                    <span className="text-[12px] tabular-nums text-ink-500 lg:hidden">{t("users.projectsOn", { n: chips.length })}</span>
                  </div>
                </li>
              );
            })}
            {visible.length === 0 && <li className="px-5 py-8 text-center text-[13px] text-ink-500">{t("team.empty")}</li>}
          </ul>
        )}

        {/* Pagination */}
        {page && (pageNo > 1 || hasNext) && (
          <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5 sm:px-5">
            <Button variant="secondary" size="sm" disabled={pageNo <= 1 || loading} onClick={() => setPageNo((n) => n - 1)} icon={<Icons.back className="h-3.5 w-3.5" />}>{t("users.prev")}</Button>
            <span className="text-[12px] tabular-nums text-ink-500">{totalPages != null ? t("users.page", { n: pageNo, total: totalPages }) : t("users.pageOnly", { n: pageNo })}</span>
            <Button variant="secondary" size="sm" disabled={!hasNext || loading} onClick={() => setPageNo((n) => n + 1)}>{t("users.next")}<Icons.chevron className="ms-1 h-3.5 w-3.5" /></Button>
          </div>
        )}
      </Card>

      {/* Create user posts to the API; the list reloads to show the new user. */}
      <AddUserDialog open={open} users={knownUsers} onClose={() => setOpen(false)} onAdd={() => { setOpen(false); setFlash(t("team.added")); reload(); }} />
    </div>
  );
}
