# Foresight — Predictive Task & Project Management SaaS

Monorepo for the platform described in *Product Vision & System Requirements V5*.
Micro-frontend architecture on **Next.js Multi-Zones**, shared kernel packages, and a single-file clickable prototype.

```
apps/
  shell/        zone "/"           — login, dashboard, settings (roles), session API, edge auth guard   :3000
  projects/     zone "/projects"   — projects list, task board, task detail + forecast                  :3001
  billing/      zone "/billing"    — plans, seats, usage, internal revenue dashboard                    :3002
packages/
  forecast/     working-calendar engine + the 7 spec formulas (§5.1) with tests reproducing §5.2
  rbac/         role → permission matrix (§4.1) with can()/assertCan(); drives API, UI and the matrix screen
  i18n/         EN + AR dictionaries (RTL-ready)
  ui/           design tokens (Tailwind preset), primitives, app shell, all screens, demo data
  next-host/    adapter: Next.js router + cookie session → the host contract the UI expects
  db/           Prisma schema (PostgreSQL) for the full data model
prototype/      Vite host that bundles the same screens into one HTML file (hash router, in-memory session)
DESIGN.md       design system: tokens, motion, layout, component states, copy rules
ROADMAP.md      phased plan from this scaffold to launch
```

## Run

```bash
npm install
npm test                        # forecast + rbac unit tests
npm run prototype               # → prototype/dist/index.html (open it in a browser)
npm run dev                     # starts all three zones; open http://localhost:3000
```

Demo sign-in: any email + a password of 8+ characters; pick a role chip to act as that user.
Owner and PM (organization admins) also get an **Admin** tab at `/settings/admin` where the role → permission
matrix can be customized; saved overrides drive every `useCan()` check, the Roles tab, and server-side guards.
"Today" is pinned to **Thu 10 Sep 2026** so the spec's worked example (API Integration → +10 working days) reproduces exactly.

## How the micro-frontends fit together

* The **shell** owns `/`, authentication and org-level settings. Its `next.config.ts` rewrites `/projects/*` and `/billing/*`
  to the other zones (`PROJECTS_ZONE_URL`, `BILLING_ZONE_URL` in production; localhost ports in dev).
* Each zone has its own `basePath` and `assetPrefix`, deploys independently, and reads the same `ptp_session` cookie.
* Navigation inside a zone is client-side; crossing a zone boundary is a full navigation by design (`packages/next-host`).
* Everything visual lives in `packages/ui`, so a zone is ~40 lines of pages + a layout. The prototype mounts the same
  components under a hash router, which is why it stays pixel-identical to the real app.

## Replace the demo pieces for production

| Demo today | Production |
|---|---|
| Cookie with `{email, role}` (`apps/shell/app/api/session`) | Auth.js (credentials + Google + SAML/OIDC), Argon2id, signed httpOnly session, rate limiting |
| `packages/ui/src/mock.ts` | Prisma queries in server components / route handlers (`packages/db`) |
| `DEMO_TODAY` | `new Date()` in the org's timezone; snapshots materialised by a nightly + on-change job |
| Alerts implied by `health === "delayed"` | Queue worker → email / Slack / Teams with de-duplication |
