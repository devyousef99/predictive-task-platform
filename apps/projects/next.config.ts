import type { NextConfig } from "next";

/** "projects" zone: served under /projects, deployed independently, proxied by the shell. */
const config: NextConfig = {
  basePath: "/projects",
  assetPrefix: "/projects-static",
  transpilePackages: ["@ptp/api", "@ptp/ui", "@ptp/rbac", "@ptp/forecast", "@ptp/i18n", "@ptp/next-host"],
};
export default config;
