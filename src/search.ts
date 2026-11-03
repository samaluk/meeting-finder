import { Temporal } from "@js-temporal/polyfill";
import { Clock, Effect } from "effect";
import type { ResolvedSearchAudience, MeetingCandidate, SearchResult } from "./domain/search.js";
import type { FinderError } from "./errors.js";
import { CalendarAvailability } from "./providers.js";
import { readCalendarSnapshot } from "./search/calendars.js";
import { evaluateCandidate, selectNonOverlapping, sortCandidates } from "./search/candidates.js";
import { searchWindow } from "./search/window.js";
export type {
  ParticipantObservation,
  MeetingCandidate,
  CalendarError,
  SearchResult,
} from "./domain/search.js";
export const searchAudience = (
  audience: ResolvedSearchAudience,
): Effect.Effect<SearchResult, FinderError, CalendarAvailability> =>
  Effect.gen(function* () {
    const { timeZone, durationMinutes, stepMinutes, bufferMinutes, minAttendance, maxResults } =
      audience.request;
    const { windowStart, windowEnd } = yield* searchWindow(audience);
    const calendarIds = [
      ...new Set(audience.participants.flatMap((participant) => participant.calendarIds)),
    ];
    const queryStart = windowStart.subtract({ minutes: bufferMinutes }).toInstant().toString();
    const queryEnd = windowEnd.add({ minutes: bufferMinutes }).toInstant().toString();
    const service = yield* CalendarAvailability;
    const availability = yield* service.query(calendarIds, queryStart, queryEnd);
    const calendars = yield* readCalendarSnapshot(availability, calendarIds, queryStart, queryEnd);
    const now = Temporal.Instant.fromEpochMilliseconds(yield* Clock.currentTimeMillis);
    const candidates: MeetingCandidate[] = [];
    const blocked: MeetingCandidate[] = [];
    let evaluatedCount = 0;
    let cursor = windowStart;
    while (cursor.toInstant().epochNanoseconds < windowEnd.toInstant().epochNanoseconds) {
      const end = cursor.add({ minutes: durationMinutes });
      if (end.toInstant().epochNanoseconds > windowEnd.toInstant().epochNanoseconds) break;
      evaluatedCount++;
      if (evaluatedCount % 128 === 0) yield* Effect.yieldNow;
      const meeting = { start: cursor.toInstant(), end: end.toInstant() };
      if (meeting.start.epochNanoseconds >= now.epochNanoseconds) {
        const candidate = evaluateCandidate(audience, meeting, calendars);
        if (candidate.requiredConflicts.length === 0 && candidate.availableCount >= minAttendance)
          candidates.push(candidate);
        else if (candidate.availableCount > 0) blocked.push(candidate);
      }
      cursor = cursor.add({ minutes: stepMinutes });
    }
    candidates.sort(sortCandidates);
    blocked.sort(
      (left, right) =>
        left.requiredConflicts.length - right.requiredConflicts.length ||
        sortCandidates(left, right),
    );
    const selected = selectNonOverlapping(candidates, maxResults);
    return {
      timeZone,
      audience,
      searchedAt: now.toString(),
      candidates: selected,
      blockedAlternatives: selected.length === 0 ? blocked.slice(0, Math.min(5, maxResults)) : [],
      evaluatedCount,
      validCount: candidates.length,
      calendarsWithErrors: calendars.errors,
    };
  }).pipe(Effect.withSpan("meeting-finder.search.evaluate"));
