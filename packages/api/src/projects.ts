import { apiRequest } from "./client";
// Registers the auth store's token provider with the client, so every call here sends the bearer token.
import "./auth-store";

/** `data` of a successful create; fields are optional until the backend contract is final. */
export interface CreateProjectResult {
  id?: string | number;
  [key: string]: unknown;
}

/**
 * Project endpoints. Authenticated: `apiRequest` sends `Authorization: Bearer <token>` from the
 * auth store once the login + emailed code are verified (a 401 signs the user out).
 */
export const projectsApi = {
  /** Creates a project from the new-project wizard's full payload (project, scope, schedule, cost, team, backlog, risks). */
  createProject: (payload: object) =>
    apiRequest<CreateProjectResult | null>("/admin/projects/createProject", { method: "POST", body: payload }),

  /** Every project the signed-in user can see. Raw `data`; map it with the UI's `toProjectSummary`. */
  getAllProjects: (signal?: AbortSignal) =>
    apiRequest<unknown>("/admin/projects/getAllProjects", { method: "GET", signal }),
};
