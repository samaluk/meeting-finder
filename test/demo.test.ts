import { Effect } from "effect";
import { describe, expect, it } from "@effect/vitest";
import { DemoCalendarAvailability, DemoDirectory, demoSources } from "../src/adapters/demo.js";
import { MeetingFinder } from "../src/meeting-finder.js";
import { Directory, CalendarAvailability } from "../src/providers.js";

describe("demo adapters", () => {
  it.effect("exposes the acceptance fixtures", () =>
    Effect.gen(function* () {
      const chat = yield* DemoDirectory.expand({ type: "chat_space", ref: "spaces/example" }, {});
      const group = yield* DemoDirectory.expand(
        { type: "google_group", ref: "team@example.test" },
        {},
      );
      expect(chat.members).toHaveLength(20);
      expect(group.members).toHaveLength(8);
      expect(group.members.at(-1)?.id).toBe("extra@example.test");
      expect(demoSources.map((item) => item.type)).toContain("chat_space");
    }),
  );

  it.effect("returns deterministic simulated availability", () =>
    Effect.gen(function* () {
      const first = yield* DemoCalendarAvailability.query(
        ["p1@example.test", "p2@example.test"],
        "2030-01-01",
        "2030-01-02",
      );
      const second = yield* DemoCalendarAvailability.query(
        ["p1@example.test", "p2@example.test"],
        "2030-02-01",
        "2030-02-02",
      );
      const reordered = yield* DemoCalendarAvailability.query(
        ["p2@example.test", "p1@example.test"],
        "2030-01-01",
        "2030-01-02",
      );
      expect(first.calendars["p1@example.test"]?.busy).toHaveLength(1);
      expect(first.calendars["p2@example.test"]?.busy).toEqual(
        reordered.calendars["p2@example.test"]?.busy,
      );
      expect(first.calendars["p1@example.test"]?.busy).toEqual(
        reordered.calendars["p1@example.test"]?.busy,
      );
      expect(second.calendars["p1@example.test"]?.busy?.[0]?.start).toContain("2030-02-01T");
    }),
  );

  it.effect("resolves the acceptance audience and leaves useful demo candidates", () =>
    Effect.gen(function* () {
      const input = {
        startDate: "2030-01-07",
        endDate: "2030-01-11",
        timeZone: "America/Santiago",
        durationMinutes: 60,
        stepMinutes: 60,
        minAttendance: 1,
        maxResults: 12,
        sources: [
          { type: "chat_space" as const, ref: "spaces/example", required: true },
          { type: "google_group" as const, ref: "team@example.test", required: false },
        ],
        overrides: [
          { id: "p2@example.test", required: true, weight: 10 },
          { id: "p20@example.test", required: true },
        ],
      };
      const resolved = yield* MeetingFinder.resolve(input).pipe(
        Effect.provideService(Directory, DemoDirectory),
      );
      expect(resolved.total).toBe(21);
      expect(resolved.requiredCount).toBe(14);
      expect(resolved.optionalCount).toBe(7);
      const result = yield* MeetingFinder.search(input).pipe(
        Effect.provideService(Directory, DemoDirectory),
        Effect.provideService(CalendarAvailability, DemoCalendarAvailability),
      );
      expect(result.candidates.length).toBeGreaterThan(0);
    }),
  );

  it.effect("rejects an unknown demo source", () =>
    Effect.gen(function* () {
      const result = yield* Effect.exit(
        DemoDirectory.expand({ type: "chat_space", ref: "spaces/unknown" }, {}),
      );
      expect(result._tag).toBe("Failure");
    }),
  );
});
