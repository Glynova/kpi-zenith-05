export function formatCurrency(value: number | null | undefined, currency = "USD") {
  const amount = Number(value ?? 0);
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function formatNumber(value: number | null | undefined, digits = 0) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(
    Number(value ?? 0),
  );
}

export function formatDate(value: string | null | undefined, timeZone?: string) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...(timeZone ? { timeZone } : {}),
  });
}

export function formatDateTime(value: string | null | undefined, timeZone?: string) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  });
}

export function formatPercent(value: number | null | undefined, digits = 1) {
  return `${Number(value ?? 0).toFixed(digits)}%`;
}

/** Calendar date in the business timezone (YYYY-MM-DD). */
export function todayISO(timeZone?: string) {
  const d = new Date();
  if (!timeZone) return d.toISOString().slice(0, 10);
  try {
    // en-CA renders as YYYY-MM-DD.
    return new Intl.DateTimeFormat("en-CA", { timeZone }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/** Whole days between today (business timezone) and a date — expiry countdowns. */
export function daysUntil(value: string | null | undefined, timeZone?: string) {
  if (!value) return null;
  const target = new Date(`${String(value).slice(0, 10)}T00:00:00Z`).getTime();
  const today = new Date(`${todayISO(timeZone)}T00:00:00Z`).getTime();
  if (Number.isNaN(target)) return null;
  return Math.round((target - today) / 86_400_000);
}

export function monthStartISO() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

export function daysAgoISO(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}


export function titleCase(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
