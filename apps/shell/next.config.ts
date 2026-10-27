import type { NextConfig } from "next";

/**
 * Shell zone: owns "/", auth, settings; proxies every other zone by prefix (Next.js Multi-Zones).
 * Keep this list in sync with packages/next-host/src/zones.ts.
 */
const ZONES = [
  { prefix: "/projects", envUrl: "PROJECTS_ZONE_URL", devPort: 3001 },
  { prefix: "/billing", envUrl: "BILLING_ZONE_URL", devPort: 3002 },
];

const config: NextConfig = {
  transpilePackages: ["@ptp/api", "@ptp/ui", "@ptp/rbac", "@ptp/forecast", "@ptp/i18n", "@ptp/next-host"],
  async rewrites() {
    return ZONES.flatMap((z) => {
      const target = process.env[z.envUrl] ?? `http://localhost:${z.devPort}`;
      return [
        { source: z.prefix, destination: `${target}${z.prefix}` },
        { source: `${z.prefix}/:path*`, destination: `${target}${z.prefix}/:path*` },
        // the zone's static assets are namespaced by its assetPrefix
        { source: `${z.prefix}-static/:path*`, destination: `${target}${z.prefix}-static/:path*` },
      ];
    });
  },
};
export default config;
