import { describe, expect, it } from "vitest";

import {
  addCalendarDays,
  buildDateBuckets,
  dateInTimeZone,
  getDateRange,
  validateCustomDateRange,
  type DateRangeSelection,
} from "./date-range";

const now = new Date("2026-11-01T16:00:00.000Z");
const timezone = "Asia/Manila";

describe("business date ranges", () => {
  it.each([
    ["today", "2026-11-02", "2026-11-02"],
    ["last7", "2026-10-27", "2026-11-02"],
    ["last15", "2026-10-19", "2026-11-02"],
    ["last30", "2026-10-04", "2026-11-02"],
    ["month", "2026-10-02", "2026-11-02"],
    ["year", "2025-11-02", "2026-11-02"],
  ] as const)("resolves %s on a fixed Manila date", (preset, fromDate, toDate) => {
    const range = getDateRange({ preset }, { timezone, now });
    expect(range.fromDate).toBe(fromDate);
    expect(range.toDate).toBe(toDate);
    expect(range.from).toContain("+08:00");
    expect(range.to).toContain("+08:00");
  });

  it("uses the last 30 days when all time has no transaction history", () => {
    const range = getDateRange({ preset: "all" }, { timezone, now, earliestDate: null });
    expect(range.fromDate).toBe("2026-10-04");
    expect(range.previousFrom).toBeNull();
  });

  it("uses the earliest transaction date for all time", () => {
    const range = getDateRange({ preset: "all" }, { timezone, now, earliestDate: "2020-03-15" });
    expect(range.fromDate).toBe("2020-03-15");
    expect(range.label).toBe("All time");
  });

  it("computes a matching prior period and no prior period for all time", () => {
    const range = getDateRange({ preset: "last7" }, { timezone, now });
    expect(range.previousFromDate).toBe("2026-10-20");
    expect(range.previousToDate).toBe("2026-10-26");
    const allTime = getDateRange({ preset: "all" }, { timezone, now, earliestDate: "2020-01-01" });
    expect(allTime.previousFromDate).toBeNull();
    expect(allTime.previousToDate).toBeNull();
  });

  it("uses the preceding calendar month and year for comparison periods", () => {
    const month = getDateRange({ preset: "month" }, { timezone, now });
    expect(month.previousFromDate).toBe("2026-09-02");
    expect(month.previousToDate).toBe("2026-10-01");
    const year = getDateRange({ preset: "year" }, { timezone, now });
    expect(year.previousFromDate).toBe("2024-11-02");
    expect(year.previousToDate).toBe("2025-11-01");
  });

  it("does not compute a custom comparison when there is no previous history", () => {
    const custom: DateRangeSelection = {
      preset: "custom",
      start: "2026-10-30",
      end: "2026-11-02",
    };
    const range = getDateRange(custom, {
      timezone,
      now,
      earliestDate: "2026-10-30",
    });
    expect(range.previousFromDate).toBeNull();
  });

  it("validates custom dates and caps the range at five years", () => {
    expect(validateCustomDateRange("2026-11-01", "2026-11-02", "2026-11-02")).toBeNull();
    expect(validateCustomDateRange("2026-11-02", "2026-11-01", "2026-11-02")).toContain("End date");
    expect(validateCustomDateRange("2026-11-02", "2026-11-03", "2026-11-02")).toContain("Future");
    expect(validateCustomDateRange("2020-11-01", "2026-11-02", "2026-11-02")).toContain(
      "five years",
    );
  });

  it("assigns 1:00 AM Manila time to that Manila calendar day", () => {
    const saleAtOneAm = new Date("2026-11-01T17:00:00.000Z");
    const range = getDateRange({ preset: "today" }, { timezone, now: saleAtOneAm });
    expect(range.fromDate).toBe("2026-11-02");
    expect(dateInTimeZone(saleAtOneAm, timezone)).toBe("2026-11-02");
    expect(saleAtOneAm.toISOString()).toBe("2026-11-01T17:00:00.000Z");
  });

  it("fills day, week, and month buckets across calendar boundaries", () => {
    expect(buildDateBuckets("2026-10-30", "2026-11-02", "day")).toHaveLength(4);
    expect(buildDateBuckets("2026-10-30", "2026-11-10", "week")).toHaveLength(3);
    expect(buildDateBuckets("2026-12-01", "2027-02-01", "month")).toHaveLength(3);
    expect(addCalendarDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});
