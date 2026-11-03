import { Temporal } from "@js-temporal/polyfill";
import type { ResolvedParticipant, AttendanceRule } from "../domain/participant.js";
import type { ParticipantObservation } from "../domain/search.js";
import { durationNanos, minutesOf, overlaps, subtract, type Interval } from "./interval.js";
import type { CalendarSnapshot } from "./calendars.js";

const atLocalTime = (
  date: Temporal.PlainDate,
  time: Temporal.PlainTime,
  timeZone: string,
): Temporal.ZonedDateTime =>
  Temporal.ZonedDateTime.from(
    {
      timeZone,
      year: date.year,
      month: date.month,
      day: date.day,
      hour: time.hour,
      minute: time.minute,
      second: time.second,
      millisecond: time.millisecond,
      microsecond: time.microsecond,
      nanosecond: time.nanosecond,
    },
    { disambiguation: "compatible" },
  );
/** Trusted working portions are intersected with the meeting before calendar subtraction. */
const workingAvailability = (
  participant: ResolvedParticipant,
  meeting: Interval,
): { portions: Interval[]; reason?: string } => {
  const { workingHours: hours, timeZone } = participant;
  const start = meeting.start.toZonedDateTimeISO(timeZone);
  const end = meeting.end.toZonedDateTimeISO(timeZone);
  const portions: Interval[] = [];
  let touchesBreak = false;
  for (
    let day = start.toPlainDate();
    Temporal.PlainDate.compare(day, end.toPlainDate()) <= 0;
    day = day.add({ days: 1 })
  ) {
    if (!hours.days.includes(day.dayOfWeek)) continue;
    const boundary = (time: string) =>
      atLocalTime(day, Temporal.PlainTime.from(time), timeZone).toInstant();
    const workStart = boundary(hours.start);
    const workEnd = boundary(hours.end);
    const clipped = {
      start:
        workStart.epochNanoseconds > meeting.start.epochNanoseconds ? workStart : meeting.start,
      end: workEnd.epochNanoseconds < meeting.end.epochNanoseconds ? workEnd : meeting.end,
    };
    if (durationNanos(clipped) <= 0n) continue;
    if (hours.breakStart !== undefined && hours.breakEnd !== undefined) {
      const pause = { start: boundary(hours.breakStart), end: boundary(hours.breakEnd) };
      if (durationNanos(pause) > 0n) {
        touchesBreak ||= overlaps(clipped, pause);
        portions.push(...subtract([clipped], pause));
      } else portions.push(clipped);
    } else portions.push(clipped);
  }
  const covered = portions.reduce((sum, portion) => sum + durationNanos(portion), 0n);
  return covered === durationNanos(meeting)
    ? { portions }
    : {
        portions,
        reason: !hours.days.includes(start.dayOfWeek)
          ? "non-working day"
          : touchesBreak
            ? "working break"
            : "outside working hours",
      };
};

const attendanceFor = (
  rule: AttendanceRule,
  meeting: Interval,
  portions: ReadonlyArray<Interval>,
) => {
  const longest = portions.reduce<Interval | undefined>(
    (best, portion) =>
      best === undefined || durationNanos(portion) > durationNanos(best) ? portion : best,
    undefined,
  );
  const longestNanos = longest === undefined ? 0n : durationNanos(longest);
  const totalNanos = portions.reduce((sum, portion) => sum + durationNanos(portion), 0n);
  const meetingNanos = durationNanos(meeting);
  let attendanceInterval: Interval | undefined;
  switch (rule.type) {
    case "full":
      if (longestNanos === meetingNanos) attendanceInterval = longest;
      break;
    case "percentage":
      if (longestNanos * 100n >= meetingNanos * BigInt(rule.percent)) attendanceInterval = longest;
      break;
    case "start":
      attendanceInterval = portions.find(
        (portion) =>
          portion.start.equals(meeting.start) &&
          durationNanos(portion) >= BigInt(rule.minutes) * 60_000_000_000n,
      );
      break;
    case "end":
      attendanceInterval = portions.find(
        (portion) =>
          portion.end.equals(meeting.end) &&
          durationNanos(portion) >= BigInt(rule.minutes) * 60_000_000_000n,
      );
      break;
  }
  const serialized = (portion: Interval) => ({
    start: portion.start.toString(),
    end: portion.end.toString(),
  });
  return {
    attendanceRule: rule,
    ruleSatisfied: attendanceInterval !== undefined,
    availableIntervals: portions.map(serialized),
    availableMinutes: minutesOf(totalNanos),
    longestAvailableMinutes: minutesOf(longestNanos),
    longestAvailablePercentage: (Number(longestNanos) * 100) / Number(meetingNanos),
    ...(attendanceInterval === undefined
      ? {}
      : { attendanceInterval: serialized(attendanceInterval) }),
  };
};
export const observeParticipant = (
  participant: ResolvedParticipant,
  meeting: Interval,
  bufferMinutes: number,
  calendars: CalendarSnapshot,
): ParticipantObservation => {
  const working = workingAvailability(participant, meeting);
  const outside = working.reason;
  let portions = working.portions;
  let busy = false;
  let unknown = false;
  const buffered = {
    start: meeting.start.subtract({ minutes: bufferMinutes }),
    end: meeting.end.add({ minutes: bufferMinutes }),
  };
  for (const calendarId of participant.calendarIds) {
    if (calendars.unknownCalendars.has(calendarId) || !calendars.busyByCalendar.has(calendarId))
      unknown = true;
    for (const occupied of calendars.busyByCalendar.get(calendarId) ?? []) {
      if (overlaps(buffered, occupied)) busy = true;
      portions = subtract(portions, {
        start: occupied.start.subtract({ minutes: bufferMinutes }),
        end: occupied.end.add({ minutes: bufferMinutes }),
      });
    }
  }
  return {
    participantId: participant.id,
    ...attendanceFor(participant.attendanceRule, meeting, unknown ? [] : portions),
    state: outside ? "outside_hours" : busy ? "busy" : unknown ? "unknown" : "free",
    localStart: meeting.start.toZonedDateTimeISO(participant.timeZone).toString(),
    localEnd: meeting.end.toZonedDateTimeISO(participant.timeZone).toString(),
    ...(outside ? { reason: outside } : {}),
  };
};
