import type { NextConfig } from "next";

/** "billing" zone: served under /billing, deployed independently, proxied by the shell. */
const config: NextConfig = {
  basePath: "/billing",
  assetPrefix: "/billing-static",
  transpilePackages: ["@ptp/api", "@ptp/ui", "@ptp/rbac", "@ptp/forecast", "@ptp/i18n", "@ptp/next-host"],
};
export default config;
