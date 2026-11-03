import { Temporal } from "@js-temporal/polyfill";

/** Calendar evidence uses elapsed instants, independently of local working rules. */
export type InstantInterval = {
  readonly start: Temporal.Instant;
  readonly end: Temporal.Instant;
};

const instant = (value: unknown): Temporal.Instant | undefined => {
  if (typeof value !== "string") return undefined;
  try {
    return Temporal.Instant.from(value);
  } catch {
    return undefined;
  }
};

/** Retain known blocks, but any missing or malformed evidence makes a calendar unknown. */
export const readBusyIntervals = (
  raw: unknown,
): { readonly intervals: ReadonlyArray<InstantInterval>; readonly invalidCount: number } => {
  if (!Array.isArray(raw)) return { intervals: [], invalidCount: 1 };
  const intervals: InstantInterval[] = [];
  let invalidCount = 0;
  for (const entry of raw) {
    const object = typeof entry === "object" && entry !== null && !Array.isArray(entry);
    const start = object ? instant(entry.start) : undefined;
    const end = object ? instant(entry.end) : undefined;
    if (start !== undefined && end !== undefined && end.epochNanoseconds > start.epochNanoseconds)
      intervals.push({ start, end });
    else invalidCount++;
  }
  return { intervals, invalidCount };
};

type Coverage = { readonly timeMin: unknown; readonly timeMax: unknown };
export type CoverageIssue = "invalid-instants" | "empty" | "short";

/** Every response must cover the complete positive requested interval. */
export const readCoverage = (
  coverage: Coverage,
  requested: Coverage,
):
  | { readonly valid: true; readonly interval: InstantInterval }
  | { readonly valid: false; readonly issue: CoverageIssue } => {
  const start = instant(coverage.timeMin);
  const end = instant(coverage.timeMax);
  const requestedStart = instant(requested.timeMin);
  const requestedEnd = instant(requested.timeMax);
  if (!start || !end || !requestedStart || !requestedEnd)
    return { valid: false, issue: "invalid-instants" };
  if (
    end.epochNanoseconds <= start.epochNanoseconds ||
    requestedEnd.epochNanoseconds <= requestedStart.epochNanoseconds
  )
    return { valid: false, issue: "empty" };
  if (
    start.epochNanoseconds > requestedStart.epochNanoseconds ||
    end.epochNanoseconds < requestedEnd.epochNanoseconds
  )
    return { valid: false, issue: "short" };
  return { valid: true, interval: { start, end } };
};
