import { Clock, Effect, Layer } from "effect";
import type { RequestInput } from "../src/domain/request.js";
import type { AttendanceRule, ParticipantInput } from "../src/domain/participant.js";
import { MeetingFinder } from "../src/meeting-finder.js";
import { CalendarAvailability, Directory } from "../src/providers.js";

export const demoPeople = [
  { id: "alex@example.test", name: "Alex", weight: 3 },
  { id: "blair@example.test", name: "Blair", weight: 3 },
  { id: "casey@example.test", name: "Casey", weight: 4 },
  { id: "devon@example.test", name: "Devon", weight: 2 },
  { id: "ellis@example.test", name: "Ellis", weight: 1 },
  { id: "finley@example.test", name: "Finley", weight: 1 },
] as const;
export type Preset = "required" | "optional" | "partial";
export const demoDate = "2030-01-07";
const instant = (time: string) => `${demoDate}T${time}:00Z`;
const block = (start: string, end: string) => ({ start: instant(start), end: instant(end) });
export const demoBusy = {
  "alex@example.test": [],
  "blair@example.test": [block("14:15", "16:00")],
  "casey@example.test": [block("13:15", "16:00")],
  "devon@example.test": [block("13:00", "13:45")],
  "ellis@example.test": [block("13:15", "13:45")],
  "finley@example.test": [],
} satisfies Record<string, ReadonlyArray<{ start: string; end: string }>>;
export const participantsFor = (preset: Preset): ReadonlyArray<ParticipantInput> =>
  demoPeople.map((person, index) => ({
    ...person,
    required: preset === "required" || index < 2,
    attendanceRule: preset === "partial" ? partialRule(index) : { type: "full" },
    timeZone: "UTC",
    workingHours: { start: "13:00", end: "16:00", days: [1] },
    calendarIds: [person.id],
  }));
const partialRule = (index: number): AttendanceRule => {
  if (index === 2) return { type: "start", minutes: 15 };
  if (index === 3) return { type: "end", minutes: 15 };
  if (index === 4) return { type: "percentage", percent: 50 };
  return { type: "full" };
};
const providers = Layer.mergeAll(
  Layer.succeed(Directory, {
    primary: Effect.die("The public demo must not look up identities"),
    list: () => Effect.die("The public demo must not list sources"),
    expand: () => Effect.die("The public demo must not expand sources"),
  }),
  Layer.succeed(CalendarAvailability, {
    query: (ids, timeMin, timeMax) =>
      Effect.succeed({
        timeMin,
        timeMax,
        calendars: Object.fromEntries(
          ids.map((id) => [
            id,
            {
              busy: demoBusy[id as keyof typeof demoBusy] ?? [],
              ...(id === "finley@example.test" ? { error: "Simulated unknown calendar" } : {}),
            },
          ]),
        ),
      }),
  }),
);
/** The public demo runs the actual facade with synthetic services. No network or credentials. */
export const simulate = (participants: ReadonlyArray<ParticipantInput>) =>
  Effect.runPromise(
    Clock.clockWith((clock) => {
      const now = Date.parse(`${demoDate}T00:00:00Z`);
      const request: RequestInput = {
        startDate: demoDate,
        endDate: demoDate,
        timeZone: "UTC",
        durationMinutes: 60,
        stepMinutes: 15,
        bufferMinutes: 0,
        maxResults: 3,
        minAttendance: 1,
        participants,
      };
      return MeetingFinder.search(request).pipe(
        Effect.provideService(Clock.Clock, {
          ...clock,
          currentTimeMillis: Effect.succeed(now),
          currentTimeMillisUnsafe: () => now,
          currentTimeNanos: Effect.succeed(BigInt(now) * 1_000_000n),
          currentTimeNanosUnsafe: () => BigInt(now) * 1_000_000n,
        }),
      );
    }).pipe(Effect.provide(providers)),
  );
