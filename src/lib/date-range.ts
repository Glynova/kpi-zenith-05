import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { db } from "@/lib/db";

export type DateRangePreset =
  "today" | "last7" | "last15" | "last30" | "month" | "year" | "all" | "custom";

export type DateRangeSelection = {
  preset: DateRangePreset;
  start?: string;
  end?: string;
};

export type DateRange = {
  from: string;
  to: string;
  fromDate: string;
  toDate: string;
  label: string;
  previousFrom: string | null;
  previousTo: string | null;
  previousFromDate: string | null;
  previousToDate: string | null;
  bucket: "day" | "week" | "month";
  preset: DateRangePreset;
  timezone: string;
};

export const DATE_RANGE_PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "last7", label: "Last 7 days" },
  { value: "last15", label: "Last 15 days" },
  { value: "last30", label: "Last 30 days" },
  { value: "month", label: "1 month" },
  { value: "year", label: "12 months" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom range" },
];

export const DEFAULT_DATE_RANGE: DateRangeSelection = { preset: "last30" };
export const DEFAULT_BUSINESS_TIMEZONE = "Asia/Manila";

const DAY_MS = 86_400_000;

function validTimeZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format();
    return timeZone;
  } catch {
    return DEFAULT_BUSINESS_TIMEZONE;
  }
}

export function dateInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: validTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function parseDate(date: string): { year: number; month: number; day: number } {
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day };
}

function dateNumber(date: string): number {
  const { year, month, day } = parseDate(date);
  return Date.UTC(year, month - 1, day);
}

function formatDate({ year, month, day }: { year: number; month: number; day: number }) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function addCalendarDays(date: string, days: number): string {
  const parts = parseDate(date);
  const value = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return formatDate({
    year: value.getUTCFullYear(),
    month: value.getUTCMonth() + 1,
    day: value.getUTCDate(),
  });
}

function addCalendarMonths(date: string, months: number): string {
  const { year, month, day } = parseDate(date);
  const targetMonth = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return formatDate({
    year: targetMonth.getUTCFullYear(),
    month: targetMonth.getUTCMonth() + 1,
    day: Math.min(day, lastDay),
  });
}

function wallTimeToInstant(date: string, time: string, timeZone: string): Date {
  const { year, month, day } = parseDate(date);
  const [hour, minute, second, millisecond] = time.split(/[.:]/).map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  let instant = target;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: validTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = formatter.formatToParts(new Date(instant));
    const values = Object.fromEntries(parts.map((part) => [part.type, Number(part.value)]));
    const represented = Date.UTC(
      values.year,
      values.month - 1,
      values.day,
      values.hour,
      values.minute,
      values.second,
      millisecond,
    );
    const correction = target - represented;
    instant += correction;
    if (correction === 0) break;
  }
  return new Date(instant);
}

function timestampWithOffset(date: string, time: string, timeZone: string): string {
  const instant = wallTimeToInstant(date, time, timeZone);
  const local = new Intl.DateTimeFormat("en-CA", {
    timeZone: validTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const values = Object.fromEntries(local.map((part) => [part.type, part.value]));
  const { year, month, day } = parseDate(date);
  const actualLocalAsUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );
  const instantAsUtc = Math.floor(instant.getTime() / 1000) * 1000;
  const offsetMinutes = Math.round((actualLocalAsUtc - instantAsUtc) / 60_000);
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffset = Math.abs(offsetMinutes);
  const [hour, minute, second, millisecond] = time.split(/[.:]/).map(Number);
  return `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}.${String(millisecond).padStart(3, "0")}${sign}${String(Math.floor(absoluteOffset / 60)).padStart(2, "0")}:${String(absoluteOffset % 60).padStart(2, "0")}`;
}

function instantWithOffset(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const localDate = `${values.year}-${values.month}-${values.day}`;
  const localTime = `${values.hour}:${values.minute}:${values.second}.000`;
  const zoned = timestampWithOffset(localDate, localTime, timeZone);
  return `${zoned.slice(0, -10)}${String(instant.getUTCMilliseconds()).padStart(3, "0")}${zoned.slice(-6)}`;
}

function prettyDate(date: string): string {
  const { year, month, day } = parseDate(date);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

export function validateCustomDateRange(start: string, end: string, today: string): string | null {
  if (!start || !end) return "Choose both a start and end date.";
  if (end < start) return "End date must be on or after the start date.";
  if (end > today || start > today) return "Future dates are not allowed.";
  if (start < addCalendarDays(today, -365 * 5)) return "Custom ranges are limited to five years.";
  return null;
}

export function getDateRange(
  selection: DateRangeSelection,
  options: { timezone?: string; now?: Date; earliestDate?: string | null } = {},
): DateRange {
  const timezone = validTimeZone(options.timezone ?? DEFAULT_BUSINESS_TIMEZONE);
  const now = options.now ?? new Date();
  const today = dateInTimeZone(now, timezone);
  const preset = selection.preset;
  let fromDate = today;
  let toDate = today;
  if (preset === "last7") fromDate = addCalendarDays(today, -6);
  if (preset === "last15") fromDate = addCalendarDays(today, -14);
  if (preset === "last30") fromDate = addCalendarDays(today, -29);
  if (preset === "month") fromDate = addCalendarMonths(today, -1);
  if (preset === "year") fromDate = addCalendarMonths(today, -12);
  if (preset === "all") fromDate = options.earliestDate ?? addCalendarDays(today, -29);
  if (preset === "custom" && selection.start && selection.end) {
    const issue = validateCustomDateRange(selection.start, selection.end, today);
    if (!issue) {
      fromDate = selection.start;
      toDate = selection.end;
    }
  }

  const rangeLength = Math.floor((dateNumber(toDate) - dateNumber(fromDate)) / DAY_MS) + 1;
  const bucket: DateRange["bucket"] =
    rangeLength <= 31 ? "day" : rangeLength <= 183 ? "week" : "month";
  let previousFromDate: string | null = null;
  let previousToDate: string | null = null;
  if (preset !== "all" && preset !== "custom") {
    if (preset === "month") {
      previousToDate = addCalendarDays(fromDate, -1);
      previousFromDate = addCalendarMonths(fromDate, -1);
    } else if (preset === "year") {
      previousToDate = addCalendarDays(fromDate, -1);
      previousFromDate = addCalendarMonths(fromDate, -12);
    } else {
      previousToDate = addCalendarDays(fromDate, -1);
      previousFromDate = addCalendarDays(previousToDate, -rangeLength + 1);
    }
  } else if (
    preset === "custom" &&
    selection.start &&
    selection.end &&
    (!options.earliestDate || addCalendarDays(selection.start, -1) >= options.earliestDate)
  ) {
    previousToDate = addCalendarDays(fromDate, -1);
    previousFromDate = addCalendarDays(previousToDate, -rangeLength + 1);
  }

  const label =
    preset === "custom" && selection.start && selection.end
      ? `${prettyDate(fromDate)} - ${prettyDate(toDate)}`
      : (DATE_RANGE_PRESETS.find((item) => item.value === preset)?.label ?? "Last 30 days");

  return {
    from: timestampWithOffset(fromDate, "00:00:00.000", timezone),
    to:
      preset === "today"
        ? instantWithOffset(now, timezone)
        : timestampWithOffset(toDate, "23:59:59.999", timezone),
    fromDate,
    toDate,
    label,
    previousFrom: previousFromDate
      ? timestampWithOffset(previousFromDate, "00:00:00.000", timezone)
      : null,
    previousTo: previousToDate
      ? timestampWithOffset(previousToDate, "23:59:59.999", timezone)
      : null,
    previousFromDate,
    previousToDate,
    bucket,
    preset,
    timezone,
  };
}

export function buildDateBuckets(
  fromDate: string,
  toDate: string,
  bucket: DateRange["bucket"],
): { key: string; label: string }[] {
  const buckets: { key: string; label: string }[] = [];
  let cursor = fromDate;
  if (bucket === "week") {
    const day = new Date(`${cursor}T12:00:00Z`).getUTCDay();
    cursor = addCalendarDays(cursor, -((day + 6) % 7));
  } else if (bucket === "month") {
    cursor = `${cursor.slice(0, 7)}-01`;
  }
  while (cursor <= toDate) {
    const label =
      bucket === "day"
        ? new Intl.DateTimeFormat("en-US", {
            timeZone: "UTC",
            month: "short",
            day: "numeric",
          }).format(new Date(`${cursor}T12:00:00Z`))
        : bucket === "week"
          ? `Week of ${new Intl.DateTimeFormat("en-US", {
              timeZone: "UTC",
              month: "short",
              day: "numeric",
            }).format(new Date(`${cursor}T12:00:00Z`))}`
          : new Intl.DateTimeFormat("en-US", {
              timeZone: "UTC",
              month: "short",
              year: "numeric",
            }).format(new Date(`${cursor}T12:00:00Z`));
    buckets.push({ key: cursor, label });
    cursor =
      bucket === "day"
        ? addCalendarDays(cursor, 1)
        : bucket === "week"
          ? addCalendarDays(cursor, 7)
          : addCalendarMonths(cursor, 1);
  }
  return buckets;
}

function selectionFromUrl(): DateRangeSelection | null {
  const params = new URLSearchParams(window.location.search);
  const preset = params.get("range") as DateRangePreset | null;
  if (!preset || !DATE_RANGE_PRESETS.some((item) => item.value === preset)) return null;
  const start = params.get("rangeStart") ?? undefined;
  const end = params.get("rangeEnd") ?? undefined;
  return { preset, start, end };
}

function parseSelection(value: string | null): DateRangeSelection | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "preset" in parsed &&
      typeof parsed.preset === "string" &&
      DATE_RANGE_PRESETS.some((item) => item.value === parsed.preset)
    ) {
      return parsed as DateRangeSelection;
    }
  } catch {
    return null;
  }
  return null;
}

function writeSelectionToUrl(selection: DateRangeSelection) {
  const url = new URL(window.location.href);
  url.searchParams.set("range", selection.preset);
  if (selection.start) url.searchParams.set("rangeStart", selection.start);
  else url.searchParams.delete("rangeStart");
  if (selection.end) url.searchParams.set("rangeEnd", selection.end);
  else url.searchParams.delete("rangeEnd");
  window.history.replaceState(window.history.state, "", url);
}

export function useBusinessDateRange(
  businessId: string | null,
  timezone?: string | null,
): {
  selection: DateRangeSelection;
  range: DateRange;
  setSelection: (selection: DateRangeSelection) => void;
  isResolvingAllTime: boolean;
  rangeError: Error | null;
} {
  const [selection, setSelectionState] = useState<DateRangeSelection>(DEFAULT_DATE_RANGE);
  const initializedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!businessId) return;
    if (initializedFor.current && initializedFor.current !== businessId) {
      setSelectionState(DEFAULT_DATE_RANGE);
      writeSelectionToUrl(DEFAULT_DATE_RANGE);
      window.localStorage.removeItem(`daraven-date-range:${businessId}`);
      initializedFor.current = businessId;
      return;
    }
    initializedFor.current = businessId;
    const stored = parseSelection(window.localStorage.getItem(`daraven-date-range:${businessId}`));
    const restored = selectionFromUrl() ?? stored ?? DEFAULT_DATE_RANGE;
    setSelectionState(restored);
    writeSelectionToUrl(restored);
  }, [businessId]);

  useEffect(() => {
    const syncFromHistory = () => {
      const restored = selectionFromUrl();
      if (restored) setSelectionState(restored);
    };
    window.addEventListener("popstate", syncFromHistory);
    return () => window.removeEventListener("popstate", syncFromHistory);
  }, []);

  const setSelection = (next: DateRangeSelection) => {
    if (!businessId) return;
    setSelectionState(next);
    window.localStorage.setItem(`daraven-date-range:${businessId}`, JSON.stringify(next));
    writeSelectionToUrl(next);
  };

  const earliestQuery = useQuery({
    queryKey: ["earliest-transaction-date", businessId],
    enabled: !!businessId && (selection.preset === "all" || selection.preset === "custom"),
    queryFn: async () => {
      const { data, error } = await db.rpc("get_business_earliest_transaction_date", {
        _business_id: businessId,
      });
      if (error) throw error;
      return typeof data === "string" ? data : null;
    },
    staleTime: 5 * 60 * 1000,
  });
  const earliestDate =
    selection.preset === "all" || selection.preset === "custom" ? earliestQuery.data : null;
  const range = useMemo(
    () => getDateRange(selection, { timezone: timezone ?? undefined, earliestDate }),
    [selection, timezone, earliestDate],
  );
  return {
    selection,
    range,
    setSelection,
    isResolvingAllTime: selection.preset === "all" && earliestQuery.isLoading,
    rangeError:
      (selection.preset === "all" || selection.preset === "custom") &&
      earliestQuery.isError &&
      earliestQuery.error instanceof Error
        ? earliestQuery.error
        : null,
  };
}
