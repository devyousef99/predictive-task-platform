import { describe, expect, it } from "vitest";
import { CALENDAR_TEMPLATES, addWorkingDays, countWorkingDays, forecastTask } from "./index";

const sunThu = CALENDAR_TEMPLATES["sun-thu"];

describe("working calendar", () => {
  it("counts Sun–Thu working days across two calendar weeks", () => {
    // 2026-09-06 is a Sunday. Sunday (day 1) → Thursday of week 2 (day 12) = 2026-09-17
    expect(countWorkingDays("2026-09-06", "2026-09-17", sunThu)).toBe(10);
  });

  it("excludes configured holidays", () => {
    const cal = { ...sunThu, holidays: ["2026-09-23"] }; // Saudi National Day (Wed)
    expect(countWorkingDays("2026-09-20", "2026-09-24", cal)).toBe(4);
  });

  it("adds working days skipping Fri/Sat", () => {
    // From Thursday 2026-09-10, +1 working day lands on Sunday 2026-09-13
    expect(addWorkingDays("2026-09-10", 1, sunThu).toISOString().slice(0, 10)).toBe("2026-09-13");
  });
});

describe("spec §5.2 worked example", () => {
  /**
   * Project: Core Mobile App | Task: API Integration
   * Schedule: Sunday–Thursday. Planned start Sunday (day 1), planned end Thursday (day 12).
   * Status check at end of Thursday week 1 (AWDE = 5), progress 25%.
   */
  const result = forecastTask({
    plannedStart: "2026-09-06",
    plannedDue: "2026-09-17",
    asOf: "2026-09-10",
    completionPct: 25,
    calendar: sunThu,
  });

  it("PWD = 10 working days", () => expect(result.pwd).toBe(10));
  it("AWDE = 5", () => expect(result.awde).toBe(5));
  it("WD-AV = 5% per working day", () => expect(result.wdav).toBe(5));
  it("REWD = 15 working days", () => expect(result.rewd).toBe(15));
  it("FCD is 3 calendar weeks later (15 working days after Thu 10 Sep → Thu 1 Oct)", () =>
    expect(result.fcd).toBe("2026-10-01"));
  it("WD-DV = 10 working days delayed", () => expect(result.wddv).toBe(10));
  it("health is red / delayed", () => expect(result.health).toBe("delayed"));
});

describe("health thresholds", () => {
  it("is on track when progress matches plan", () => {
    const r = forecastTask({
      plannedStart: "2026-09-06", plannedDue: "2026-09-17", asOf: "2026-09-10",
      completionPct: 50, calendar: sunThu,
    });
    expect(r.wddv).toBe(0);
    expect(r.health).toBe("on-track");
  });
  it("is at risk when slightly behind", () => {
    const r = forecastTask({
      plannedStart: "2026-09-06", plannedDue: "2026-09-17", asOf: "2026-09-10",
      completionPct: 42, calendar: sunThu,
    });
    expect(r.health).toBe("at-risk");
  });
  it("is not started before the first working day", () => {
    const r = forecastTask({
      plannedStart: "2026-09-13", plannedDue: "2026-09-24", asOf: "2026-09-10",
      completionPct: 0, calendar: sunThu,
    });
    expect(r.health).toBe("not-started");
    expect(r.fcd).toBeNull();
  });
});
