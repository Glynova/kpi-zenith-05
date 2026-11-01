import { useState } from "react";
import { CalendarIcon, ChevronDown } from "lucide-react";
import type { DateRange as CalendarDateRange } from "react-day-picker";

import {
  DATE_RANGE_PRESETS,
  addCalendarDays,
  dateInTimeZone,
  validateCustomDateRange,
  type DateRange,
  type DateRangeSelection,
} from "@/lib/date-range";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function calendarDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function dateValue(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

export function DateRangePicker({
  selection,
  range,
  timezone,
  onChange,
}: {
  selection: DateRangeSelection;
  range: DateRange;
  timezone: string;
  onChange: (selection: DateRangeSelection) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pendingRange, setPendingRange] = useState<CalendarDateRange | undefined>();
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const today = dateInTimeZone(new Date(), timezone);
  const earliest = addCalendarDays(today, -365 * 5);
  const customActive = selection.preset === "custom" && open;
  const currentLabel = selection.preset === "custom" ? range.label : "Custom range";

  function applyCustomRange() {
    if (!pendingRange?.from || !pendingRange.to) {
      setValidationMessage("Choose both a start and end date.");
      return;
    }
    const start = dateValue(pendingRange.from);
    const end = dateValue(pendingRange.to);
    const issue = validateCustomDateRange(start, end, today);
    if (issue) {
      setValidationMessage(issue);
      return;
    }
    onChange({ preset: "custom", start, end });
    setValidationMessage(null);
    setOpen(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={open || selection.preset === "custom" ? "custom" : selection.preset}
        onValueChange={(value) => {
          if (value === "custom") {
            setPendingRange({
              from: calendarDate(selection.start),
              to: calendarDate(selection.end),
            });
            setValidationMessage(null);
            setOpen(true);
          } else {
            onChange({ preset: value as DateRangeSelection["preset"] });
          }
        }}
      >
        <SelectTrigger className="w-44" aria-label="Select date range">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {DATE_RANGE_PRESETS.map((preset) => (
            <SelectItem key={preset.value} value={preset.value}>
              {preset.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Popover
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) setValidationMessage(null);
        }}
      >
        <PopoverTrigger asChild>
          <Button variant="outline" className="max-w-full justify-between gap-2">
            <span className="truncate">
              {selection.preset === "custom" ? currentLabel : "Choose dates"}
            </span>
            <CalendarIcon className="size-4 shrink-0" />
            <ChevronDown className="size-4 shrink-0 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto max-w-[calc(100vw-2rem)] p-0" align="end">
          <Calendar
            mode="range"
            selected={pendingRange}
            onSelect={(nextRange) => {
              setPendingRange(nextRange);
              setValidationMessage(null);
            }}
            numberOfMonths={2}
            disabled={[{ after: calendarDate(today)! }, { before: calendarDate(earliest)! }]}
            defaultMonth={calendarDate(selection.start) ?? calendarDate(today)}
          />
          <div className="space-y-3 border-t border-border p-3">
            <p className="min-h-5 text-xs text-destructive" role="status">
              {validationMessage ??
                "Select a start date, then an end date. Maximum range: 5 years."}
            </p>
            {pendingRange?.from && pendingRange.to && (
              <p className="text-sm text-muted-foreground">
                {dateValue(pendingRange.from)} - {dateValue(pendingRange.to)}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setOpen(false);
                  setValidationMessage(null);
                }}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={applyCustomRange} disabled={!pendingRange?.from}>
                Apply
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
