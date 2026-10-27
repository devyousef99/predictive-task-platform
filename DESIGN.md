# Foresight — Design System (v0.1)

Brand extracted from the V5 vision document: corporate blue tables, serious B2B tone,
"predictive intelligence" positioning. The product must feel **precise, calm, and trustworthy** —
a control tower, not a toy. Placeholder product name `Foresight` lives in one constant (`app.name`).

## Tokens

| Token | Value | Use |
|---|---|---|
| `--brand-600` | `#1F5FA8` | Primary actions, active nav, links (7.3:1 on white) |
| `--brand-700` | `#194D88` | Primary hover |
| `--brand-50` | `#EEF4FB` | Selected rows, soft badges |
| `--ink-900` | `#0F172A` | Headings |
| `--ink-700` | `#334155` | Body |
| `--ink-500` | `#64748B` | Captions, secondary |
| `--line` | `#E2E8F0` | Borders |
| `--surface` | `#FFFFFF` / `--canvas` `#F6F8FB` | Cards / page |
| `--ok` | `#0E8A6B` | On track |
| `--warn` | `#B45309` | At risk |
| `--danger` | `#C2410C` → text `#B91C1C` | Delayed / destructive |
| Radius | 6px inputs · 10px cards · 999px pills · tables 0 | Not uniformly rounded |
| Shadow | `0 1px 2px rgb(15 23 42 / .06)` cards · `0 8px 24px rgb(15 23 42 / .12)` popovers | |
| Type | Latin: **Plus Jakarta Sans** · Arabic: **IBM Plex Sans Arabic** · Numbers: tabular | |
| Scale | 12 / 13 / 14 (body) / 16 / 20 / 24 / 30 | line-height 1.5 body, 1.2 headings |
| Spacing | 4px base; page gutter 16 (mobile) / 24 (tablet) / 32 (desktop) | |

## Motion
Press feedback 120ms ease-out `scale(.98)` · show/hide 200ms · drawer 300ms `cubic-bezier(.32,.72,0,1)` ·
progress bars animate width 400ms · **prefers-reduced-motion** collapses all to ~0.

## Layout
* ≥1024px: fixed sidebar 264px (start side), top bar 56px, content max 1280px.
* 768–1023px: collapsed icon rail 72px.
* <768px: top bar + bottom tab bar (5 tabs: Dashboard, Projects, Tasks, Billing, More). Primary CTAs full-width at bottom in safe area. Tap targets ≥44px.
* RTL: `dir="rtl"` on `<html>`; **only logical utilities** (`ps-`, `me-`, `start-`, `text-start`). Charts stay LTR internally (time axis), labels flip.

## Components (states: default / hover / focus / active / disabled / loading / error)
* **Button** primary · secondary · ghost · danger; sizes sm 32 / md 40 / lg 48.
* **Input** 40px, 1.5px border, focus ring `0 0 0 3px brand-600/20`, inline error below with icon.
* **HealthBadge** dot + label; never colour alone (label always present).
* **StatTile** label / value / delta; tabular numerals.
* **PermissionMatrix** sticky first column, ✓ / — cells with `aria-label`.
* **ForecastPanel** the 7 spec metrics laid out as a computation chain.
* **KanbanColumn** six lifecycle states; card shows health, assignee, due, forecast delta.

## Copy rules
Action-first labels ("Send invite", not "Submit"). Blame-free errors ("That email doesn't look right — check for typos").
Empty states: positive headline + one-line why + CTA. Dates as "Thu 1 Oct" with working-day deltas ("+10 working days").
