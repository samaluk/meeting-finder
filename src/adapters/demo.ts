import { Effect, Layer } from "effect";
import { Temporal } from "@js-temporal/polyfill";
import type { ExternalSource } from "../domain/directory.js";
import { CalendarAvailability, Directory } from "../providers.js";
import { providerUnavailable } from "../errors.js";

const people = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => ({
    id: `p${from + i}@example.test`,
    name: `Person ${from + i}`,
  }));
const chatMembers = people(1, 20);
const groupMembers = [...people(1, 7), { id: "extra@example.test", name: "Extra Person" }];

const unknownSource = (source: ExternalSource) =>
  providerUnavailable(
    `Demo source ${source.type}:${source.ref} is not a known fixture`,
    "Use one of the sources returned by demo source listing",
  );

export const demoSources = Object.freeze([
  { type: "chat_space" as const, ref: "spaces/example", memberCount: 20 },
  { type: "google_group" as const, ref: "team@example.test", memberCount: 8 },
  { type: "contact_group" as const, ref: "demo-label", memberCount: 20 },
]);

export const DemoDirectory: Directory["Service"] = {
  list: (kind) =>
    Effect.succeed(
      demoSources
        .filter((source) => source.type === kind)
        .map((source) => ({ id: source.ref, name: source.ref, kind })),
    ),
  primary: Effect.succeed("organizer@example.test"),
  expand: (source, _groupAliases) => {
    switch (source.type) {
      case "chat_space":
        return source.ref === "spaces/example"
          ? Effect.succeed({ members: chatMembers, omitted: [] })
          : Effect.fail(unknownSource(source));
      case "google_group":
        return source.ref === "team@example.test"
          ? Effect.succeed({ members: groupMembers, omitted: [] })
          : Effect.fail(unknownSource(source));
      case "contact_group":
        return source.ref === "demo-label"
          ? Effect.succeed({ members: chatMembers, omitted: [] })
          : Effect.fail(unknownSource(source));
    }
  },
};

const stableNumber = (id: string): number => {
  let value = 0;
  for (const character of id.toLowerCase()) value = (value * 31 + character.charCodeAt(0)) >>> 0;
  return value;
};

const busyFor = (
  id: string,
  timeMin: string,
  timeMax: string,
): ReadonlyArray<{ start: string; end: string }> => {
  try {
    const instantInput = (value: string) =>
      /T/.test(value)
        ? /(?:Z|[+-]\d\d:\d\d)$/.test(value)
          ? value
          : `${value}Z`
        : `${value}T00:00:00Z`;
    const from = Temporal.Instant.from(instantInput(timeMin));
    const until = Temporal.Instant.from(instantInput(timeMax));
    const localDate = from.toZonedDateTimeISO("America/Santiago").toPlainDate();
    const hash = stableNumber(id);
    // Keep a useful busy block on the first requested local day; the hour is
    // stable per identity, so one-day and multi-day searches both have tradeoffs.
    const hour = hash % 2 === 0 ? 10 : 15;
    for (let offset = 0; offset < 4; offset++) {
      const day = localDate.add({ days: offset });
      const start = Temporal.ZonedDateTime.from({
        timeZone: "America/Santiago",
        year: day.year,
        month: day.month,
        day: day.day,
        hour,
      });
      const end = start.add({ hours: 1 });
      const interval = { start: start.toInstant(), end: end.toInstant() };
      if (
        interval.start.epochNanoseconds >= from.epochNanoseconds &&
        interval.end.epochNanoseconds <= until.epochNanoseconds
      )
        return [{ start: interval.start.toString(), end: interval.end.toString() }];
    }
    return [];
  } catch {
    return [];
  }
};

export const DemoCalendarAvailability: CalendarAvailability["Service"] = {
  query: (calendarIds, timeMin, timeMax) =>
    Effect.succeed({
      timeMin,
      timeMax,
      calendars: Object.fromEntries(
        calendarIds.map((id) => [id, { busy: busyFor(id, timeMin, timeMax) }]),
      ),
    }),
};

export const DemoDirectoryLive = Layer.succeed(Directory, DemoDirectory);
export const DemoCalendarAvailabilityLive = Layer.succeed(
  CalendarAvailability,
  DemoCalendarAvailability,
);
