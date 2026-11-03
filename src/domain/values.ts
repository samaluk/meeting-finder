import { Temporal } from "@js-temporal/polyfill";
import { Schema } from "effect";

/** A stable provider identity or calendar identifier, excluding blank values. */
export const IdentitySchema = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter((value) => value.trim().length > 0, {
      message: "Expected a nonempty identity",
    }),
  ),
);
export type Identity = Schema.Schema.Type<typeof IdentitySchema>;

/** ISO local date used by the inclusive search window. */
export const LocalDateSchema = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/u)),
  Schema.check(
    Schema.makeFilter((value) => isValidLocalDate(value), {
      message: "Expected a real ISO date (YYYY-MM-DD)",
    }),
  ),
);
export type LocalDate = Schema.Schema.Type<typeof LocalDateSchema>;

/** A local wall-clock value with minute precision. */
export const LocalTimeSchema = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^(?:[01]\d|2[0-3]):[0-5]\d$/u)),
);
export type LocalTime = Schema.Schema.Type<typeof LocalTimeSchema>;

/** IANA timezone text validated against Temporal's timezone database. */
export const TimeZoneSchema = IdentitySchema.pipe(
  Schema.check(
    Schema.makeFilter((value) => isValidTimeZone(value), {
      message: "Expected a valid Temporal timezone",
    }),
  ),
);
export type TimeZone = Schema.Schema.Type<typeof TimeZoneSchema>;

export function isValidTimeZone(value: string): boolean {
  try {
    Temporal.ZonedDateTime.from({
      timeZone: value,
      year: 2020,
      month: 1,
      day: 1,
      hour: 0,
    });
    return true;
  } catch {
    return false;
  }
}

export function isValidLocalDate(value: string): boolean {
  try {
    Temporal.PlainDate.from(value);
    return true;
  } catch {
    return false;
  }
}
