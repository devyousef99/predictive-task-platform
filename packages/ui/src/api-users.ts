"use client";
import { useCallback, useEffect, useState } from "react";
import { usersApi, type ApiUser } from "@ptp/api";
import { initialsOf } from "./models";

/** A user as the pickers and avatars need it. */
export interface UserOption { id: string; name: string; email: string; initials: string; jobTitle: string | null; raw: ApiUser }

export const toUserOption = (u: ApiUser): UserOption => {
  const name = u.fullName?.trim() || u.email;
  return { id: u._id, name, email: u.email, initials: initialsOf(name), jobTitle: u.jobTitle ?? null, raw: u };
};

/** Every user (first `pageSize` from GET /admin/users/getAllUsers), for pickers and team lists. */
export function useApiUsers(pageSize = 100) {
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true); setError(null);
    usersApi.getAllUsers(1, pageSize, ctrl.signal)
      .then((p) => setUsers(p.users.map(toUserOption)))
      .catch((err: unknown) => { if ((err as Error)?.name !== "AbortError") setError(err); })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
    return () => ctrl.abort();
  }, [pageSize, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { users, loading, error, reload };
}
