import { Temporal } from "@js-temporal/polyfill";
import type { RequestInput } from "./domain/request.js";

/** Editable CLI/web defaults; the scheduling engine has no implicit clock defaults. */
export const initialRequest = (options: {
  readonly demo?: boolean;
  readonly now: Date;
}): RequestInput => {
  const today = Temporal.Instant.fromEpochMilliseconds(options.now.getTime())
    .toZonedDateTimeISO("America/Santiago")
    .toPlainDate();
  return {
    startDate: today.toString(),
    endDate: today.add({ days: 6 }).toString(),
    timeZone: "America/Santiago",
    durationMinutes: 60,
    stepMinutes: 15,
    bufferMinutes: 10,
    minAttendance: 1,
    maxResults: 12,
    ...(options.demo
      ? {
          ...exampleAudience,
        }
      : { participants: [{ id: "primary", required: true, weight: 5 }] }),
  };
};

export const exampleAudience = {
  sources: [
    { type: "chat_space" as const, ref: "spaces/example", required: true },
    { type: "google_group" as const, ref: "team@example.test", required: false },
  ],
  overrides: [
    { id: "p2@example.test", required: true, weight: 10 },
    { id: "p20@example.test", required: true },
  ],
} satisfies Pick<RequestInput, "sources" | "overrides">;
