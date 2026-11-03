import { Temporal } from "@js-temporal/polyfill";
import { Effect } from "effect";
import type { ResolvedSearchAudience } from "../domain/search.js";
import { issue, searchError, type FinderError } from "../errors.js";

const fail = (
  detail: string,
  path: ReadonlyArray<string | number>,
): Effect.Effect<never, FinderError> =>
  Effect.fail(searchError(detail, "Correct the indicated search rule", [issue(path, detail)]));
export const searchWindow = (audience: ResolvedSearchAudience) =>
  Effect.gen(function* () {
    const { startDate, endDate, timeZone, durationMinutes, minAttendance } = audience.request;
    if (
      audience.participants.length === 0 ||
      !audience.participants.some((participant) => participant.required)
    )
      return yield* fail("search requires at least one required participant", ["participants"]);
    if (minAttendance > audience.participants.length)
      return yield* fail("Minimum attendance exceeds the audience size", ["minAttendance"]);
    for (const [index, participant] of audience.participants.entries()) {
      const rule = participant.attendanceRule;
      if ((rule.type === "start" || rule.type === "end") && rule.minutes > durationMinutes)
        return yield* fail(`Attendance minutes for ${participant.id} exceed meeting duration`, [
          "participants",
          index,
          "attendanceRule",
          "minutes",
        ]);
    }
    const firstDate = Temporal.PlainDate.from(startDate);
    const lastDate = Temporal.PlainDate.from(endDate);
    if (Temporal.PlainDate.compare(lastDate, firstDate) < 0 || firstDate.until(lastDate).days > 30)
      return yield* fail("search dates must span 0 through 30 days", ["endDate"]);

    const windowStart = firstDate.toZonedDateTime({ timeZone });
    const windowEnd = lastDate.add({ days: 1 }).toZonedDateTime({ timeZone });
    return { windowStart, windowEnd };
  });
