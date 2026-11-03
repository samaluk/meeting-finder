import { Schema } from "effect";
import { IdentitySchema, LocalTimeSchema, TimeZoneSchema } from "./values.js";
export const WeightSchema = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 }));

export const WorkingHoursSchema = Schema.Struct({
  start: LocalTimeSchema,
  end: LocalTimeSchema,
  days: Schema.Array(
    Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 1, maximum: 7 }))),
  ).pipe(Schema.check(Schema.isMinLength(1))),
  breakStart: Schema.optional(LocalTimeSchema),
  breakEnd: Schema.optional(LocalTimeSchema),
}).pipe(
  Schema.check(
    Schema.makeFilter((hours) => {
      const issues: Schema.FilterIssue[] = [];
      if (hours.start >= hours.end)
        issues.push({ path: ["end"], issue: "Working hours must end after they start" });
      if ((hours.breakStart === undefined) !== (hours.breakEnd === undefined))
        issues.push({
          path: [hours.breakStart === undefined ? "breakStart" : "breakEnd"],
          issue: "Provide both break endpoints",
        });
      if (
        hours.breakStart !== undefined &&
        hours.breakEnd !== undefined &&
        hours.breakStart >= hours.breakEnd
      )
        issues.push({ path: ["breakEnd"], issue: "The break must end after it starts" });
      return issues;
    }),
  ),
);
export type WorkingHours = Schema.Schema.Type<typeof WorkingHoursSchema>;

/** Percentage attendance always requires one uninterrupted block. */
export const AttendanceRuleSchema = Schema.Union([
  Schema.Struct({ type: Schema.Literal("full") }),
  Schema.Struct({
    type: Schema.Literal("start"),
    minutes: Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 1, maximum: 480 }))),
  }),
  Schema.Struct({
    type: Schema.Literal("end"),
    minutes: Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 1, maximum: 480 }))),
  }),
  Schema.Struct({
    type: Schema.Literal("percentage"),
    percent: Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 1, maximum: 100 }))),
  }),
]);
export type AttendanceRule = Schema.Schema.Type<typeof AttendanceRuleSchema>;

export const ParticipantSchema = Schema.Struct({
  attendanceRule: Schema.optional(AttendanceRuleSchema),
  id: IdentitySchema,
  name: Schema.optional(Schema.String),
  required: Schema.optional(Schema.Boolean),
  weight: Schema.optional(WeightSchema),
  timeZone: Schema.optional(TimeZoneSchema),
  workingHours: Schema.optional(WorkingHoursSchema),
  calendarIds: Schema.optional(
    Schema.Array(IdentitySchema).pipe(Schema.check(Schema.isBetweenLength(1, 10))),
  ),
});
export type ParticipantInput = Schema.Schema.Type<typeof ParticipantSchema>;

export const OverrideSchema = Schema.Struct({
  attendanceRule: Schema.optional(AttendanceRuleSchema),
  id: IdentitySchema,
  required: Schema.optional(Schema.Boolean),
  weight: Schema.optional(WeightSchema),
});
export type OverrideInput = Schema.Schema.Type<typeof OverrideSchema>;

export const ParticipantDefaultsSchema = Schema.Struct({
  attendanceRule: Schema.optional(AttendanceRuleSchema),
  timeZone: Schema.optional(TimeZoneSchema),
  workingHours: Schema.optional(WorkingHoursSchema),
});
export const ParticipantSchemaResolved = Schema.Struct({
  attendanceRule: AttendanceRuleSchema,
  id: Schema.String,
  name: Schema.optional(Schema.String),
  required: Schema.Boolean,
  weight: Schema.Int,
  timeZone: Schema.String,
  workingHours: WorkingHoursSchema,
  calendarIds: Schema.Array(Schema.String),
  memberships: Schema.Array(Schema.String),
});
export type ResolvedParticipant = Schema.Schema.Type<typeof ParticipantSchemaResolved>;

export const defaultTimeZone = "America/Santiago";
export const defaultWorkingHours: WorkingHours = {
  start: "09:00",
  end: "18:00",
  days: [1, 2, 3, 4, 5],
};
