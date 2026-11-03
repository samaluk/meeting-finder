import { Temporal } from "@js-temporal/polyfill";
import type { ResolvedSearchAudience, MeetingCandidate } from "../domain/search.js";
import { observeParticipant } from "./attendance.js";
import { overlaps, type Interval } from "./interval.js";
import type { CalendarSnapshot } from "./calendars.js";

export const sortCandidates = (a: MeetingCandidate, b: MeetingCandidate): number =>
  b.availableWeight - a.availableWeight ||
  b.availableCount - a.availableCount ||
  (a.start < b.start ? -1 : a.start > b.start ? 1 : 0);
export const selectNonOverlapping = (
  candidates: ReadonlyArray<MeetingCandidate>,
  maxResults: number,
): ReadonlyArray<MeetingCandidate> => {
  const selected: MeetingCandidate[] = [];
  for (const candidate of candidates) {
    const interval = {
      start: Temporal.Instant.from(candidate.start),
      end: Temporal.Instant.from(candidate.end),
    };
    if (
      selected.every(
        (other) =>
          !overlaps(interval, {
            start: Temporal.Instant.from(other.start),
            end: Temporal.Instant.from(other.end),
          }),
      )
    )
      selected.push(candidate);
    if (selected.length >= maxResults) break;
  }
  return selected;
};
export const evaluateCandidate = (
  audience: ResolvedSearchAudience,
  meeting: Interval,
  calendars: CalendarSnapshot,
): MeetingCandidate => {
  const observations = audience.participants.map((participant) =>
    observeParticipant(participant, meeting, audience.request.bufferMinutes, calendars),
  );
  const available = observations.filter((observation) => observation.ruleSatisfied);
  const availableWeight = audience.participants.reduce(
    (sum, participant, index) =>
      sum + (observations[index]?.ruleSatisfied ? participant.weight : 0),
    0,
  );
  const totalWeight = audience.participants.reduce(
    (sum, participant) => sum + participant.weight,
    0,
  );
  const requiredConflicts = audience.participants
    .filter((participant, index) => participant.required && !observations[index]?.ruleSatisfied)
    .map((participant) => participant.id);
  const candidate: MeetingCandidate = {
    start: meeting.start.toString(),
    end: meeting.end.toString(),
    score: Number(((100 * availableWeight) / totalWeight).toFixed(1)),
    availableWeight,
    totalWeight,
    availableCount: available.length,
    attendance: available.length,
    requiredConflicts,
    participants: observations,
  };
  return candidate;
};
