"use client";
import type { ReactNode } from "react";
import { AppShell, RequireSession } from "@ptp/ui";

/** Signed-in pages: client-side session check (sessionStorage), then the app shell. */
export function Protected({ children }: { children: ReactNode }) {
  return <RequireSession><AppShell>{children}</AppShell></RequireSession>;
}