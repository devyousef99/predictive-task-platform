import { apiRequest } from "./client";
// Registers the auth store's token provider with the client, so every call here sends the bearer token.
import "./auth-store";

/** Project header shown above the board (`data.project` of getBoard). */
export interface BoardProject {
  _id?: string;
  title: string;
  /** on_track | at_risk | delayed | completed */
  health?: string;
  calendar?: { label?: string };
  plannedDue?: string;
  budget?: number;
  currency?: string;
}

/** One card. getBoard, getTasks and moveTask all return this shape. */
export interface BoardTask {
  _id: string;
  title: string;
  priority?: string;
  priorityLabel?: string;
  progress?: { percent?: number; startedAt?: string | null };
  plan?: { start?: string; due?: string; hours?: number };
  /** Working days late; show only when > 0. */
  slipDays?: number;
  /** on_track | at_risk | delayed | completed */
  health?: string;
  assignee?: { _id?: string; name?: string; initials?: string } | null;
  /** Optimistic-concurrency version; send it back on moveTask. */
  version?: number;
  columnId?: string;
}

export interface BoardColumn {
  _id: string;
  name: string;
  count?: number;
  /** Already in drag order. */
  tasks: BoardTask[];
}

export interface BoardData {
  project: BoardProject;
  columns: BoardColumn[];
}

export interface MoveTaskBody {
  columnId: string;
  /** Card above the drop position; omit both ids to drop at the end of the column. */
  beforeId?: string | null;
  /** Card below the drop position. */
  afterId?: string | null;
  version?: number;
}

export interface CreateTaskBody {
  title: string;
  priority?: string;
  tags?: string[];
  plan: { start: string; due: string; hours?: number };
  assigneeId?: string | null;
  /** Defaults to Backlog on the server. */
  columnId?: string;
}

/** PATCH updateTask body: every field optional (send at least one). Only changed fields are written. */
export interface UpdateTaskBody {
  title?: string;
  description?: string;
  priority?: "low" | "medium" | "high" | "critical" | 1 | 2 | 3 | 4;
  tags?: string[];
  plan?: { start?: string; due?: string; hours?: number };
  assigneeId?: string | null;
  reviewerId?: string | null;
  /** Moves the task to the end of that column. */
  columnId?: string;
  /** percent 100 ⇄ Done column are kept in sync by the server. */
  progress?: { percent?: number; actualHours?: number };
}

export interface TaskFilters {
  status?: string;
  assigneeId?: string;
  priority?: string;
  search?: string;
}

const id = (v: string) => encodeURIComponent(v);

/** Task board endpoints (bearer token added automatically). */
export const tasksApi = {
  /** Board for one project: header + columns with cards in drag order. */
  getBoard: (projectId: string, signal?: AbortSignal) =>
    apiRequest<BoardData>(`/admin/tasks/getBoard/${id(projectId)}`, { signal }),

  /** Moves a card; returns the updated card. 409 = someone else changed it first → reload the board. */
  moveTask: (taskId: string, body: MoveTaskBody) =>
    apiRequest<BoardTask>(`/admin/tasks/moveTask/${id(taskId)}`, { method: "PATCH", body }),

  /** Creates a task (title, plan.start and plan.due required). */
  createTask: (projectId: string, body: CreateTaskBody) =>
    apiRequest<BoardTask>(`/admin/tasks/createTask/${id(projectId)}`, { method: "POST", body }),

  /** Same cards as the board, as one flat list sorted by due date. */
  getTasks: (projectId: string, filters: TaskFilters = {}, signal?: AbortSignal) => {
    const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]).toString();
    return apiRequest<BoardTask[]>(`/admin/tasks/getTasks/${id(projectId)}${qs ? `?${qs}` : ""}`, { signal });
  },

  /** Updates a task; returns the full task (same shape as getTask, with the new version). */
  updateTask: (taskId: string, body: UpdateTaskBody) =>
    apiRequest<unknown>(`/admin/tasks/updateTask/${id(taskId)}`, { method: "PATCH", body }),

  /** Everything on the task-details page, including the forecast and comments. */
  getTask: (taskId: string, signal?: AbortSignal) =>
    apiRequest<unknown>(`/admin/tasks/getTask/${id(taskId)}`, { signal }),
};
