import type { AttendanceRule, ResolvedParticipant } from "../src/domain/participant.js";
import type { MeetingCandidate, ParticipantObservation } from "../src/domain/search.js";
import type { Mode } from "../src/mode.js";
export const orderedObservations = (
  people: ReadonlyArray<ResolvedParticipant>,
  candidate: MeetingCandidate,
) =>
  [...candidate.participants].sort((left, right) => {
    const leftRequired =
      people.find((person) => person.id === left.participantId)?.required === true;
    const rightRequired =
      people.find((person) => person.id === right.participantId)?.required === true;
    return Number(rightRequired) - Number(leftRequired);
  });
export const attendanceLabel = (rule: AttendanceRule): string => {
  switch (rule.type) {
    case "full":
      return "Whole meeting";
    case "start":
      return `First ${rule.minutes} minutes`;
    case "end":
      return `Last ${rule.minutes} minutes`;
    case "percentage":
      return `At least ${rule.percent}% in one continuous block`;
  }
};
export const observationText = (observation: ParticipantObservation, timeZone: string): string => {
  const portions = observation.availableIntervals
    .map(
      (portion) =>
        `${formatInstant(portion.start, timeZone)}–${formatInstant(portion.end, timeZone)}`,
    )
    .join("; ");
  return `${attendanceLabel(observation.attendanceRule)}: ${observation.ruleSatisfied ? "met" : "not met"}. ${observation.state === "free" ? "Free for whole meeting" : observation.state}. Longest free block: ${Number(observation.longestAvailableMinutes.toFixed(2))} min (${Number(observation.longestAvailablePercentage.toFixed(2))}%). Free portions (${timeZone}): ${portions || "none confirmed"}${observation.reason ? `. ${observation.reason}` : ""}`;
};

export const formatInstant = (value: string, timeZone: string): string => {
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
};

export const formatProposal = (
  candidate: MeetingCandidate,
  context: { readonly timeZone: string; readonly audienceSize: number; readonly mode: Mode },
): string => {
  return `${formatInstant(candidate.start, context.timeZone)} – ${formatInstant(candidate.end, context.timeZone)} (${context.timeZone})\nAttendance: ${candidate.availableCount}/${context.audienceSize}; coverage: ${candidate.score}%\nAttendance rule met: ${candidate.participants
    .filter((a) => a.ruleSatisfied)
    .map((a) => `${a.participantId} (${observationText(a, context.timeZone)})`)
    .join(", ")}\nAttendance rule not met: ${
    candidate.participants
      .filter((observation) => !observation.ruleSatisfied)
      .map(
        (observation) =>
          `${observation.participantId} (${observationText(observation, context.timeZone)})`,
      )
      .join(", ") || "None"
  }\nConflicts: ${candidate.requiredConflicts.join(", ") || "None"}\nTimezone: ${context.timeZone}\nSimulated: ${context.mode === "demo"}\nNo event, invitation, or message was sent.`;
};
