import { Schema } from "effect";
import { IdentitySchema, LocalDateSchema, TimeZoneSchema } from "./values.js";
import {
  ParticipantSchema,
  OverrideSchema,
  ParticipantDefaultsSchema,
  WeightSchema,
} from "./participant.js";
export const SourceTypeSchema = Schema.Literals([
  "person",
  "emails",
  "chat_space",
  "google_group",
  "contact_group",
]);
export type SourceType = Schema.Schema.Type<typeof SourceTypeSchema>;

export const SourceSchema = Schema.Struct({
  type: SourceTypeSchema,
  ref: IdentitySchema,
  required: Schema.optional(Schema.Boolean),
  weight: Schema.optional(WeightSchema),
});
export type SourceInput = Schema.Schema.Type<typeof SourceSchema>;
/** Chat membership resource names are opaque; aliases must still be usable. */
export const GroupAliasesSchema = Schema.Record(Schema.String, Schema.String).pipe(
  Schema.check(
    Schema.makeFilter((aliases) => {
      const issues: Schema.FilterIssue[] = [];
      for (const [key, value] of Object.entries(aliases)) {
        if (key.trim().length === 0)
          issues.push({ path: [key], issue: "Alias keys must be nonempty" });
        if (value.trim().length === 0)
          issues.push({ path: [key], issue: "Alias values must be nonempty" });
      }
      return issues;
    }),
  ),
);

const DurationMinutesSchema = Schema.Int.pipe(
  Schema.check(Schema.isBetween({ minimum: 5, maximum: 480 })),
);
const StepMinutesSchema = Schema.Int.check(Schema.isBetween({ minimum: 5, maximum: 60 }));
const BufferMinutesSchema = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 120 }));
const MinAttendanceSchema = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 }));
const MaxResultsSchema = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 50 }));

export const RequestInputSchema = Schema.Struct({
  startDate: Schema.optional(LocalDateSchema),
  endDate: Schema.optional(LocalDateSchema),
  timeZone: Schema.optional(TimeZoneSchema),
  durationMinutes: Schema.optional(DurationMinutesSchema),
  stepMinutes: Schema.optional(StepMinutesSchema),
  bufferMinutes: Schema.optional(BufferMinutesSchema),
  minAttendance: Schema.optional(MinAttendanceSchema),
  maxResults: Schema.optional(MaxResultsSchema),
  sources: Schema.optional(Schema.Array(SourceSchema).pipe(Schema.check(Schema.isMaxLength(20)))),
  participants: Schema.optional(
    Schema.Array(ParticipantSchema).pipe(Schema.check(Schema.isMaxLength(100))),
  ),
  participantDefaults: Schema.optional(ParticipantDefaultsSchema),
  overrides: Schema.optional(
    Schema.Array(OverrideSchema).pipe(Schema.check(Schema.isMaxLength(100))),
  ),
  groupAliases: Schema.optional(GroupAliasesSchema),
});
export type RequestInput = Schema.Schema.Type<typeof RequestInputSchema>;

/** Search requires meeting fields; resolution may receive audience-only input. */
export const SearchInputSchema = Schema.Struct({
  ...RequestInputSchema.fields,
  startDate: LocalDateSchema,
  endDate: LocalDateSchema,
  timeZone: TimeZoneSchema,
  durationMinutes: DurationMinutesSchema,
});
export type SearchInput = Schema.Schema.Type<typeof SearchInputSchema>;

/** Search input after defaults and required meeting fields have been established. */
export const NormalizedSearchRequestSchema = Schema.Struct({
  ...SearchInputSchema.fields,
  stepMinutes: StepMinutesSchema,
  bufferMinutes: BufferMinutesSchema,
  minAttendance: MinAttendanceSchema,
  maxResults: MaxResultsSchema,
});
export type NormalizedSearchRequest = Schema.Schema.Type<typeof NormalizedSearchRequestSchema>;
