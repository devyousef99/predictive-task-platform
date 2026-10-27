/**
 * Micro-frontend zone registry (Next.js Multi-Zones).
 * The shell owns "/" and rewrites each prefix to the zone's own deployment.
 * Navigating across zones is a full page load — by design, so zones deploy independently.
 */
export const ZONES = [
  { id: "projects", prefix: "/projects", envUrl: "PROJECTS_ZONE_URL", devPort: 3001 },
  { id: "billing", prefix: "/billing", envUrl: "BILLING_ZONE_URL", devPort: 3002 },
] as const;

export type ZoneId = (typeof ZONES)[number]["id"] | "shell";

export function zoneFor(path: string): ZoneId {
  const z = ZONES.find((z) => path === z.prefix || path.startsWith(z.prefix + "/"));
  return z?.id ?? "shell";
}
