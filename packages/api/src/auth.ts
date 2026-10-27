import { apiRequest } from "./client";

/** `data` of a successful POST /auth/login. The token is a 60-minute JWT carrying { id, role }. */
export interface LoginResult {
  id: string;
  role: string;
  token: string;
}

/** `data` of POST /auth/verifyMailCode. Fields are optional: some deployments re-issue the token here. */
export interface VerifyCodeResult {
  token?: string;
  id?: string;
  role?: string;
}

/** Raw auth endpoints. UI code should go through `useAuthStore`, which keeps the shared state in sync. */
export const authApi = {
  /** Checks credentials and emails a 6-digit code (expires in ~2 minutes). The backend's `username` is the user's email. */
  login: (username: string, password: string) =>
    apiRequest<LoginResult>("/auth/login", { method: "POST", body: { username, password }, token: null }),

  verifyMailCode: (email: string, code: string, token?: string | null) =>
    apiRequest<VerifyCodeResult | null>("/auth/verifyMailCode", { method: "POST", body: { email, otpToken: code }, token }),

  /** Public endpoint: only the email is sent, no Authorization header. */
  resendMailCode: (email: string) =>
    apiRequest<unknown>("/auth/resendMailCode", { method: "POST", body: { email }, token: null }),
};
