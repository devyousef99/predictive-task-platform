import { ar } from "./ar";
import { en, type Dictionary } from "./en";

export type Locale = "en" | "ar";
export const LOCALES: Locale[] = ["en", "ar"];
export const dictionaries: Record<Locale, Dictionary> = { en, ar };
export const dirOf = (locale: Locale): "ltr" | "rtl" => (locale === "ar" ? "rtl" : "ltr");

/** Tiny interpolation: t("dashboard.daysLate", { n: 3 }) */
export function interpolate(template: string, vars?: Record<string, string | number>) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

export type { Dictionary };
export { en, ar };
