import type { InstantInterval } from "../domain/availability.js";

export type Interval = InstantInterval;
export const durationNanos = (interval: Interval): bigint =>
  interval.end.epochNanoseconds - interval.start.epochNanoseconds;
export const minutesOf = (nanos: bigint): number => Number(nanos) / 60_000_000_000;
export const subtract = (portions: ReadonlyArray<Interval>, block: Interval): Interval[] =>
  portions.flatMap((portion) => {
    if (!overlaps(portion, block)) return [portion];
    const remaining: Interval[] = [];
    if (portion.start.epochNanoseconds < block.start.epochNanoseconds)
      remaining.push({ start: portion.start, end: block.start });
    if (portion.end.epochNanoseconds > block.end.epochNanoseconds)
      remaining.push({ start: block.end, end: portion.end });
    return remaining;
  });
export const overlaps = (a: Interval, b: Interval): boolean =>
  a.start.epochNanoseconds < b.end.epochNanoseconds &&
  b.start.epochNanoseconds < a.end.epochNanoseconds;
