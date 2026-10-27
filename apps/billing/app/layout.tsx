import type { Metadata } from "next";
import type { ReactNode } from "react";
import { BOOT_SCRIPT, NextHost } from "@ptp/next-host";
import "./globals.css";

export const metadata: Metadata = { title: "Foresight — Predictive Task Platform", description: "Know the finish date before the deadline does." };

/** Session, locale and theme live in sessionStorage (no cookies); BOOT_SCRIPT applies theme + direction before first paint. */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>
      <body>
        <NextHost zone="billing" basePath="/billing">{children}</NextHost>
      </body>
    </html>
  );
}