/**
 * Shared HTTP client for the backend API. Every app and package calls the backend through
 * `apiRequest`, so the base URL, auth header, and response envelope live in one place.
 */

/** Standard response envelope returned by every backend endpoint. */
export interface ApiEnvelope<T> {
  message: string;
  messageEn: string;
  messageAr: string;
  statusCode: number;
  data: T;
}

/** Thrown for any non-2xx response (or network failure); carries the backend's localized messages. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly messageEn: string,
    readonly messageAr: string,
  ) {
    super(messageEn);
    this.name = "ApiError";
  }

  /** The backend's message in the given locale, falling back to English. */
  localized(locale: "en" | "ar"): string {
    return (locale === "ar" ? this.messageAr : this.messageEn) || this.messageEn || this.message;
  }
}

// Module-local typing so this compiles without @types/node (the Vite prototype); Next.js still inlines NEXT_PUBLIC_*.
declare const process: { env: Record<string, string | undefined> } | undefined;

/**
 * Backend origin, e.g. https://api.example.com → requests go to https://api.example.com/auth/login.
 * Set NEXT_PUBLIC_API_URL in each Next.js app's `.env.local` (inlined at build time).
 * The backend must allow CORS from the app's origin.
 */
export const API_BASE_URL = (
  (typeof process !== "undefined" ? process.env.NEXT_PUBLIC_API_URL : undefined) || "http://localhost:9090"
).replace(/\/+$/, "");

/**
 * DEMO ONLY: skip the emailed-code step after a successful login. On unless NEXT_PUBLIC_SKIP_OTP=false.
 * Set NEXT_PUBLIC_SKIP_OTP=false (or change the default below) to require the code again.
 */
export const SKIP_OTP: boolean = (() => {
  const v = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_SKIP_OTP : undefined;
  return v === undefined || v === "" ? true : v === "true";
})();

/** Supplies the bearer token for authenticated calls; registered by the auth store. */
let tokenProvider: () => string | null = () => null;
/** Called on 401 so the auth store can drop an expired or revoked token. */
let unauthorizedHandler: () => void = () => {};

export function configureApiClient(opts: { getToken?: () => string | null; onUnauthorized?: () => void }) {
  if (opts.getToken) tokenProvider = opts.getToken;
  if (opts.onUnauthorized) unauthorizedHandler = opts.onUnauthorized;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** Overrides the stored token (e.g. the pre-OTP token from /auth/login). Pass null to send none. */
  token?: string | null;
  signal?: AbortSignal;
}

/** Calls the backend and returns the envelope's `data`; throws `ApiError` otherwise. */
export async function apiRequest<T>(path: string, { method = "GET", body, token, signal }: RequestOptions = {}): Promise<T> {
  const bearer = token === undefined ? tokenProvider() : token;
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      signal,
      headers: {
        accept: "application/json",
        ...(body !== undefined && { "content-type": "application/json" }),
        ...(bearer && { authorization: `Bearer ${bearer}` }),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") throw err;
    throw new ApiError(0, "Can't reach the server — check your connection and try again", "تعذّر الاتصال بالخادم — تحقق من اتصالك وحاول مرة أخرى");
  }

  const json = (await res.json().catch(() => null)) as Partial<ApiEnvelope<T>> | null;
  if (!res.ok) {
    if (res.status === 401 && bearer && token === undefined) unauthorizedHandler();
    throw new ApiError(res.status, json?.messageEn || json?.message || res.statusText, json?.messageAr || "");
  }
  return json?.data as T;
}
