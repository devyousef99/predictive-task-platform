"use client";
import { useEffect, type ReactNode } from "react";
import { landingPath, pageAllowed, type PageId } from "./access";
import { useApp, useCan, useRoleMatrix, useSession, useT } from "./context";
import { Button, Card, Icons, Spinner } from "./primitives";

/**
 * Renders the page only if the user may open it (backend permissions, else the role matrix);
 * otherwise a friendly no-access card with a way home. Waits while permissions load for the first time.
 */
export function PageGuard({ page, children }: { page: PageId; children: ReactNode }) {
  const can = useCan();
  const { permissionsPending } = useApp();
  if (pageAllowed(can, page)) return <>{children}</>;
  if (permissionsPending) return <div className="flex justify-center py-16 text-brand-600"><Spinner className="h-6 w-6" /></div>;
  return <NoAccess />;
}

export function NoAccess() {
  const { t } = useT();
  const { navigate } = useApp();
  const session = useSession();
  const matrix = useRoleMatrix();
  const home = landingPath(session.principal, matrix);
  return (
    <div className="animate-rise mx-auto mt-10 max-w-[480px]">
      <Card>
        <div className="flex flex-col items-center text-center">
          <span className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-warn-50 text-warn-700"><Icons.lock className="h-6 w-6" /></span>
          <h1 className="text-[20px]">{t("auth.noAccessTitle")}</h1>
          <p className="mt-1 max-w-[40ch] text-[13px] text-ink-500">{t("auth.noAccessBody")}</p>
          <Button className="mt-5" onClick={() => navigate(home)} icon={<Icons.back className="h-4 w-4" />}>{t("auth.goHome")}</Button>
        </div>
      </Card>
    </div>
  );
}

/** Signed-in pages: renders children only with a session, otherwise sends the visitor to /login. */
export function RequireSession({ children }: { children: ReactNode }) {
  const { session, navigate } = useApp();
  useEffect(() => { if (!session) navigate("/login"); }, [session, navigate]);
  return session ? <>{children}</> : null;
}

/** Sign-in pages (/login, /verify-otp): a visitor who is already signed in goes to their home page. */
export function GuestOnly({ children }: { children: ReactNode }) {
  const { session } = useApp();
  return session ? <RedirectHome /> : <>{children}</>;
}

/** Sends a signed-in user to their role's home page (e.g. when they land on /login). */
export function RedirectHome() {
  const { navigate } = useApp();
  const session = useSession();
  const matrix = useRoleMatrix();
  const home = landingPath(session.principal, matrix);
  useEffect(() => { navigate(home); }, [home, navigate]);
  return null;
}
