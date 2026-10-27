"use client";
import { useState } from "react";
import { useCan, useT } from "../context";
import { fmtMoney } from "../data";
import { PLANS, type PlanTier } from "../models";
import { Button, Card, EmptyState, Icons, PageHeader, Pill, cx } from "../primitives";

const TIER_KEY: Record<PlanTier, "billing.free" | "billing.pro" | "billing.business" | "billing.enterprise"> = { free: "billing.free", pro: "billing.pro", business: "billing.business", enterprise: "billing.enterprise" };
const ORDER: PlanTier[] = ["free", "pro", "business", "enterprise"];

/**
 * Plans & billing. Shows the plan catalog; the organization's subscription, usage and invoices
 * appear here once a billing API is connected (no placeholder numbers are shown).
 */
export function BillingScreen() {
  const { t, locale } = useT();
  const can = useCan();
  const [cycle, setCycle] = useState<"monthly" | "annual">("annual");
  const canManage = can("org.billing.manage");

  return (
    <div className="animate-rise">
      <PageHeader title={t("billing.title")} subtitle={t("billing.proration")} />

      <Card title={t("billing.currentPlan")}>
        <EmptyState title={t("billing.notConnected")} body={t("billing.notConnectedBody")} />
      </Card>

      {/* Plan catalog */}
      <div className="mb-3 mt-6 flex items-center justify-between">
        <h2 className="text-[17px]">{t("billing.title")}</h2>
        <div role="radiogroup" className="inline-flex rounded-md border border-line bg-surface p-0.5 text-[13px]">
          {(["monthly", "annual"] as const).map((c) => (
            <button key={c} type="button" role="radio" aria-checked={cycle === c} onClick={() => setCycle(c)} className={cx("h-8 rounded px-3 font-medium", cycle === c ? "bg-brand-50 text-brand-700" : "text-ink-500")}>
              {t(`billing.${c}`)}{c === "annual" && <span className="ms-1.5 rounded bg-ok-50 px-1.5 text-[11px] text-ok-700">{t("billing.save", { pct: 20 })}</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {ORDER.map((id) => {
          const p = PLANS.find((x) => x.id === id)!;
          const price = cycle === "annual" ? p.annual : p.monthly;
          const highlight = id === "business";
          return (
            <div key={id} className={cx("flex flex-col rounded-lg border bg-surface p-5 shadow-card", highlight ? "border-brand-600" : "border-transparent")}>
              <div className="flex items-center justify-between"><h3 className="text-[15px]">{t(TIER_KEY[id])}</h3>{highlight && <Pill tone="brand">Popular</Pill>}</div>
              <p className="text-[12px] text-ink-500">{p.audience}</p>
              <p className="mt-3 text-[28px] font-semibold tabular-nums text-ink-900">{price == null ? t("billing.custom") : price === 0 ? "$0" : fmtMoney(price, locale)}<span className="text-[12px] font-normal text-ink-500">{price != null && price > 0 ? ` ${t("billing.perUserMonth")}` : ""}</span></p>
              <ul className="mt-4 flex-1 space-y-1.5 text-[13px] text-ink-700">
                {p.features.map((f) => <li key={f} className="flex gap-2"><Icons.check className="mt-0.5 h-4 w-4 shrink-0 text-ok-600" />{f}</li>)}
                <li className="flex gap-2 text-ink-500"><Icons.check className="mt-0.5 h-4 w-4 shrink-0 text-ink-300" />{p.storage} {t("billing.storage").toLowerCase()}</li>
              </ul>
              <Button className="mt-5" full variant={highlight ? "primary" : "secondary"} disabled={!canManage}>
                {price == null ? t("billing.contactSales") : t("billing.upgrade", { plan: t(TIER_KEY[id]) })}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Internal platform-operator module. Shows revenue once a revenue API is connected. */
export function RevenueScreen() {
  const { t } = useT();
  return (
    <div className="animate-rise">
      <PageHeader title={t("billing.revenue")} subtitle={t("billing.internalOnly")} />
      <Card><EmptyState title={t("billing.noRevenue")} body={t("billing.notConnectedBody")} /></Card>
    </div>
  );
}
