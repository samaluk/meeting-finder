import { Effect } from "effect";
import {
  readBusyIntervals,
  readCoverage,
  type InstantInterval,
} from "../../domain/availability.js";
import type { CalendarAvailability } from "../../providers.js";
import type { GwsProcess } from "../gws-process.js";
import { command, object, provider, runJson, text } from "./client.js";
export const makeGwsCalendarAvailability = (p: GwsProcess): CalendarAvailability["Service"] => ({
  query: (ids, timeMin, timeMax) => {
    const batches = Array.from({ length: Math.ceil(ids.length / 50) }, (_, i) =>
      ids.slice(i * 50, i * 50 + 50),
    );
    return Effect.forEach(
      batches,
      (batch) =>
        runJson(
          p,
          command(
            ["calendar", "freebusy", "query"],
            {},
            {
              timeMin,
              timeMax,
              calendarExpansionMax: 50,
              groupExpansionMax: 100,
              items: batch.map((id) => ({ id })),
            },
          ),
        ),
      { concurrency: Math.min(2, p.concurrency ?? 2) },
    ).pipe(
      Effect.flatMap((values) => {
        const calendars: Record<
          string,
          { busy: ReadonlyArray<{ start: string; end: string }>; error?: string }
        > = {};
        let coverageStart: InstantInterval["start"] | undefined;
        let coverageEnd: InstantInterval["end"] | undefined;
        const requested = { timeMin, timeMax };
        const requestedCoverage = readCoverage(requested, requested);
        if (!requestedCoverage.valid)
          return provider(
            requestedCoverage.issue === "invalid-instants"
              ? "requested freebusy coverage has invalid instants"
              : "requested freebusy coverage is invalid",
          );
        for (const value of values) {
          if (!object(value) || !object(value.calendars) || Array.isArray(value.calendars))
            return provider("gws freebusy response is malformed");
          if (!text(value.timeMin) || !text(value.timeMax))
            return provider("gws freebusy response does not declare its coverage window");
          const coverage = readCoverage(
            { timeMin: value.timeMin, timeMax: value.timeMax },
            requested,
          );
          if (!coverage.valid) {
            switch (coverage.issue) {
              case "invalid-instants":
                return provider("gws freebusy response has invalid coverage instants");
              case "empty":
                return provider("gws freebusy response has an invalid coverage window");
              case "short":
                return provider("gws freebusy response does not cover the requested window");
            }
          }
          const { start: batchStart, end: batchEnd } = coverage.interval;
          coverageStart =
            coverageStart === undefined ||
            batchStart.epochNanoseconds > coverageStart.epochNanoseconds
              ? batchStart
              : coverageStart;
          coverageEnd =
            coverageEnd === undefined || batchEnd.epochNanoseconds < coverageEnd.epochNanoseconds
              ? batchEnd
              : coverageEnd;
          for (const [id, entry] of Object.entries(value.calendars)) {
            if (!object(entry)) {
              calendars[id] = { busy: [], error: "calendar response is malformed" };
              continue;
            }
            const rawBusy = entry.busy;
            const rawErrors = entry.errors;
            const errors: string[] = [];
            if (rawErrors !== undefined) {
              if (
                !Array.isArray(rawErrors) ||
                rawErrors.some((e) => !object(e) || !text(e.domain) || !text(e.reason))
              ) {
                errors.push("calendar errors are malformed");
              } else if (rawErrors[0] && object(rawErrors[0])) {
                errors.push("calendar access failed");
              }
            }
            const { intervals, invalidCount } = readBusyIntervals(rawBusy);
            if (invalidCount > 0) errors.push("calendar busy response is malformed");
            const busy = intervals.map(({ start, end }) => ({
              start: start.toString(),
              end: end.toString(),
            }));
            calendars[id] = {
              busy,
              ...(errors.length > 0 ? { error: errors.join("; ") } : {}),
            };
          }
        }
        for (const id of ids)
          if (!calendars[id])
            calendars[id] = { busy: [], error: "calendar omitted from provider response" };
        return Effect.succeed({
          timeMin: coverageStart?.toString() ?? timeMin,
          timeMax: coverageEnd?.toString() ?? timeMax,
          calendars,
        });
      }),
    );
  },
});
