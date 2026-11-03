import { Schema } from "effect";
import { AttendanceRuleSchema } from "./participant.js";
import { NormalizedSearchRequestSchema } from "./request.js";
import { ResolvedAudienceSchema } from "./audience.js";
export const AvailabilityStateSchema = Schema.Literals([
  "free",
  "busy",
  "outside_hours",
  "unknown",
]);
export const AvailableIntervalSchema = Schema.Struct({
  start: Schema.String,
  end: Schema.String,
});
export const ParticipantObservationSchema = Schema.Struct({
  attendanceRule: AttendanceRuleSchema,
  ruleSatisfied: Schema.Boolean,
  availableIntervals: Schema.Array(AvailableIntervalSchema),
  availableMinutes: Schema.Finite,
  longestAvailableMinutes: Schema.Finite,
  longestAvailablePercentage: Schema.Finite,
  attendanceInterval: Schema.optional(AvailableIntervalSchema),
  participantId: Schema.String,
  state: AvailabilityStateSchema,
  localStart: Schema.String,
  localEnd: Schema.String,
  reason: Schema.optional(Schema.String),
});
export type ParticipantObservation = Schema.Schema.Type<typeof ParticipantObservationSchema>;

export const MeetingCandidateSchema = Schema.Struct({
  start: Schema.String,
  end: Schema.String,
  score: Schema.Finite,
  availableWeight: Schema.Int,
  totalWeight: Schema.Int,
  availableCount: Schema.Int,
  attendance: Schema.Int,
  requiredConflicts: Schema.Array(Schema.String),
  participants: Schema.Array(ParticipantObservationSchema),
});
export type MeetingCandidate = Schema.Schema.Type<typeof MeetingCandidateSchema>;

export const CalendarErrorSchema = Schema.Struct({
  calendarId: Schema.String,
  detail: Schema.String,
});
export type CalendarError = Schema.Schema.Type<typeof CalendarErrorSchema>;

/** Search responses always carry the fully defaulted request used by evaluation. */
export const ResolvedSearchAudienceSchema = Schema.Struct({
  ...ResolvedAudienceSchema.fields,
  request: NormalizedSearchRequestSchema,
});
export type ResolvedSearchAudience = Schema.Schema.Type<typeof ResolvedSearchAudienceSchema>;

export const SearchResultSchema = Schema.Struct({
  audience: ResolvedSearchAudienceSchema,
  timeZone: Schema.String,
  searchedAt: Schema.String,
  candidates: Schema.Array(MeetingCandidateSchema),
  blockedAlternatives: Schema.Array(MeetingCandidateSchema),
  evaluatedCount: Schema.Int,
  validCount: Schema.Int,
  calendarsWithErrors: Schema.Array(CalendarErrorSchema),
});
export type SearchResult = Schema.Schema.Type<typeof SearchResultSchema>;
