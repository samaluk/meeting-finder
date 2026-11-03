import { Effect } from "effect";
import type { CalendarAvailabilityResult } from "../providers.js";
import type { CalendarError } from "../domain/search.js";
import { providerResponse, type FinderError } from "../errors.js";
import {
  readBusyIntervals,
  readCoverage,
  type InstantInterval as Interval,
} from "../domain/availability.js";

export interface CalendarSnapshot {
  readonly busyByCalendar: ReadonlyMap<string, ReadonlyArray<Interval>>;
  readonly unknownCalendars: ReadonlySet<string>;
  readonly errors: ReadonlyArray<CalendarError>;
}
const providerFail = (detail: string): Effect.Effect<never, FinderError> =>
  Effect.fail(
    providerResponse(detail, "Retry the availability query or inspect the calendar provider"),
  );
export const readCalendarSnapshot = (
  availability: CalendarAvailabilityResult,
  calendarIds: ReadonlyArray<string>,
  queryStart: string,
  queryEnd: string,
): Effect.Effect<CalendarSnapshot, FinderError> =>
  Effect.gen(function* () {
    if (
      availability === null ||
      typeof availability !== "object" ||
      availability.calendars === null ||
      typeof availability.calendars !== "object" ||
      Array.isArray(availability.calendars)
    )
      return yield* providerFail("availability response has no calendar collection");
    const calendarErrors: CalendarError[] = [];
    const busyByCalendar = new Map<string, ReadonlyArray<Interval>>();
    const unknownCalendars = new Set<string>();
    for (const id of calendarIds) {
      const calendar = availability.calendars[id];
      if (!calendar || typeof calendar !== "object" || !Array.isArray(calendar.busy)) {
        calendarErrors.push({
          calendarId: id,
          detail: "availability response omitted or malformed calendar",
        });
        unknownCalendars.add(id);
        continue;
      }
      if (calendar.error) {
        calendarErrors.push({ calendarId: id, detail: calendar.error });
        unknownCalendars.add(id);
      }
      const { intervals, invalidCount } = readBusyIntervals(calendar.busy);
      for (let index = 0; index < invalidCount; index++) {
        calendarErrors.push({ calendarId: id, detail: "invalid busy interval" });
        unknownCalendars.add(id);
      }
      busyByCalendar.set(id, intervals);
    }
    const coverage = readCoverage(availability, { timeMin: queryStart, timeMax: queryEnd });
    if (!coverage.valid)
      return yield* providerFail(
        coverage.issue === "short"
          ? "availability response does not cover the requested window"
          : "availability response contains an invalid coverage window",
      );
    return { busyByCalendar, unknownCalendars, errors: calendarErrors };
  });
