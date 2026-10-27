// Visual verification: screenshots at mobile + desktop, LTR + RTL, across key routes.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";

const file = "file://" + "/home/claude/predictive-task-platform/prototype/dist/index.html";
const out = "/home/claude/predictive-task-platform/prototype/shots"; mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const routes = ["/", "/projects", "/projects/p1", "/projects/p1/tasks/t1", "/settings/roles", "/billing", "/billing/revenue"];

for (const [name, vp] of [["desktop", { width: 1366, height: 860 }], ["mobile", { width: 390, height: 844 }]]) {
  for (const locale of ["en", "ar"]) {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await page.goto(file + "#/login");
    await page.evaluate((l) => localStorage.setItem("ptp.locale", l), locale);
    await page.reload();
    await page.waitForSelector("form");
    await page.screenshot({ path: `${out}/${name}-${locale}-login.png` });
    // Sign in as owner via the demo chips
    await page.getByRole("button", { pressed: false }).first().click().catch(() => {});
    await page.fill('input[name="email"]', "yousef@foresight.app");
    await page.fill('input[name="password"]', "demo-pass-2026");
    await page.click('button[type="submit"]');
    await page.waitForSelector("main");
    for (const r of routes) {
      await page.evaluate((r) => { location.hash = r; }, r);
      await page.waitForTimeout(350);
      await page.screenshot({ path: `${out}/${name}-${locale}-${r.replace(/\//g, "_") || "root"}.png`, fullPage: name === "mobile" });
    }
    if (errors.length) console.log(name, locale, "ERRORS:", errors);
    await ctx.close();
  }
}
await browser.close();
console.log("done");
