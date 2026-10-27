"use client";
import { useApp } from "./context";
import { PageGuard, RedirectHome } from "./guard";
import { AppShell } from "./shell";
import { AdminRolesScreen } from "./screens/admin-roles";
import { AvailabilityScreen } from "./screens/availability";
import { BillingScreen, RevenueScreen } from "./screens/billing";
import { DashboardScreen } from "./screens/dashboard";
import { LoginScreen } from "./screens/login";
import { VerifyOtpScreen } from "./screens/verify-otp";
import { NewProjectScreen } from "./screens/new-project";
import { ProjectsScreen, TaskBoardScreen } from "./screens/projects";
import { RoleMatrixScreen } from "./screens/roles";
import { TaskDetailScreen } from "./screens/task-detail";
import { TeamScreen } from "./screens/team";
import { UsersAdminScreen } from "./screens/users";

export type Route =
  | { screen: "login" }
  | { screen: "verifyOtp" }
  | { screen: "dashboard" }
  | { screen: "projects" }
  | { screen: "newProject" }
  | { screen: "tasks"; projectId?: string }
  | { screen: "task"; projectId: string; taskId: string }
  | { screen: "roles" }
  | { screen: "admin" }
  | { screen: "users" }
  | { screen: "availability" }
  | { screen: "team" }
  | { screen: "billing" }
  | { screen: "revenue" }
  | { screen: "notfound" };

/** Shared path grammar. Zones own subsets: shell → `/`, `/login`, `/settings/*`, `/team`, `/availability`; projects → `/projects/*`; billing → `/billing/*`. */
export function matchRoute(pathname: string): Route {
  const p = pathname.replace(/\/+$/, "") || "/";
  if (p === "/login") return { screen: "login" };
  if (p === "/verify-otp") return { screen: "verifyOtp" };
  if (p === "/") return { screen: "dashboard" };
  if (p === "/projects") return { screen: "projects" };
  if (p === "/projects/new") return { screen: "newProject" };
  if (p === "/projects/tasks") return { screen: "tasks" };
  let m = p.match(/^\/projects\/([^/]+)\/tasks\/([^/]+)$/);
  if (m) return { screen: "task", projectId: m[1], taskId: m[2] };
  m = p.match(/^\/projects\/([^/]+)$/);
  if (m) return { screen: "tasks", projectId: m[1] };
  if (p === "/settings/roles") return { screen: "roles" };
  if (p === "/settings/admin") return { screen: "admin" };
  if (p === "/settings/users") return { screen: "users" };
  if (p === "/availability") return { screen: "availability" };
  if (p === "/team") return { screen: "team" };
  if (p === "/billing") return { screen: "billing" };
  if (p === "/billing/revenue") return { screen: "revenue" };
  return { screen: "notfound" };
}

/** Signed-out users only ever see the login page; signed-in users get each page behind its role guard. */
export function Router() {
  const { pathname, session } = useApp();
  const route = matchRoute(pathname);
  if (!session) return route.screen === "verifyOtp" ? <VerifyOtpScreen /> : <LoginScreen />;
  if (route.screen === "login" || route.screen === "verifyOtp") return <RedirectHome />;
  return (
    <AppShell>
      {route.screen === "dashboard" && <PageGuard page="dashboard"><DashboardScreen /></PageGuard>}
      {route.screen === "projects" && <PageGuard page="projects"><ProjectsScreen /></PageGuard>}
      {route.screen === "newProject" && <PageGuard page="projects"><NewProjectScreen /></PageGuard>}
      {route.screen === "tasks" && <PageGuard page={route.projectId ? "projects" : "tasks"}><TaskBoardScreen projectId={route.projectId} /></PageGuard>}
      {route.screen === "task" && <PageGuard page="tasks"><TaskDetailScreen taskId={route.taskId} projectId={route.projectId} /></PageGuard>}
      {route.screen === "roles" && <PageGuard page="roles"><RoleMatrixScreen /></PageGuard>}
      {route.screen === "admin" && <PageGuard page="admin"><AdminRolesScreen /></PageGuard>}
      {route.screen === "users" && <PageGuard page="users"><UsersAdminScreen /></PageGuard>}
      {route.screen === "availability" && <PageGuard page="availability"><AvailabilityScreen /></PageGuard>}
      {route.screen === "team" && <PageGuard page="team"><TeamScreen /></PageGuard>}
      {route.screen === "billing" && <PageGuard page="billing"><BillingScreen /></PageGuard>}
      {route.screen === "revenue" && <PageGuard page="revenue"><RevenueScreen /></PageGuard>}
      {route.screen === "notfound" && <p className="text-ink-500">Not found.</p>}
    </AppShell>
  );
}
