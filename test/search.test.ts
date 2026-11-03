import { Effect, Layer } from "effect";
import { GwsCalendarAvailabilityLive } from "../src/adapters/gws.js";
import { GwsProcessTag, type GwsProcess } from "../src/adapters/gws-process.js";
import { TestClock } from "effect/testing";
import { describe, expect, it } from "@effect/vitest";
import type { ParticipantInput, RequestInput } from "../src/contracts.js";
import { MeetingFinder } from "../src/meeting-finder.js";
import { CalendarAvailability, Directory } from "../src/providers.js";

const participant = (id: string, required: boolean, weight: number): ParticipantInput => ({
  id,
  required,
  weight,
  timeZone: "America/Santiago",
  workingHours: { start: "09:00", end: "18:00", days: [1, 2, 3, 4, 5] },
  calendarIds: [id],
});
const request = (overrides: Partial<RequestInput> = {}): RequestInput => ({
  startDate: "2030-01-07",
  endDate: "2030-01-07",
  timeZone: "America/Santiago",
  durationMinutes: 60,
  stepMinutes: 60,
  bufferMinutes: 0,
  minAttendance: 1,
  maxResults: 3,
  ...overrides,
});
const provider = (busy: Record<string, ReadonlyArray<{ start: string; end: string }>> = {}) =>
  ({
    query: (calendarIds: ReadonlyArray<string>, timeMin: string, timeMax: string) =>
      Effect.succeed({
        timeMin,
        timeMax,
        calendars: Object.fromEntries(calendarIds.map((id) => [id, { busy: busy[id] ?? [] }])),
      }),
  }) as CalendarAvailability["Service"];
const directory: Directory["Service"] = {
  list: () => Effect.succeed([]),
  primary: Effect.succeed("organizer@example.test"),
  expand: () => Effect.succeed({ members: [], omitted: [] }),
};
const runSearch = (
  input: RequestInput,
  busy: Record<string, ReadonlyArray<{ start: string; end: string }>> = {},
) =>
  Effect.runPromise(
    Effect.gen(function* () {
      yield* TestClock.setTime(Date.parse("2029-12-01T00:00:00Z"));
      return yield* MeetingFinder.search(input);
    }).pipe(
      Effect.provideService(Directory, directory),
      Effect.provideService(CalendarAvailability, provider(busy)),
      Effect.provide(TestClock.layer()),
    ),
  );

describe("MeetingFinder.search", () => {
  it("uses one post-provider Clock instant for stale filtering and searchedAt", async () => {
    const advancingProvider: CalendarAvailability["Service"] = {
      query: (calendarIds, timeMin, timeMax) =>
        Effect.gen(function* () {
          yield* TestClock.adjust("2 days");
          return {
            timeMin,
            timeMax,
            calendars: Object.fromEntries(calendarIds.map((id) => [id, { busy: [] }])),
          };
        }),
    };
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        yield* TestClock.setTime(Date.parse("2030-01-07T00:00:00Z"));
        return yield* MeetingFinder.search({
          ...request(),
          participants: [participant("required", true, 1)],
        });
      }).pipe(
        Effect.provideService(Directory, directory),
        Effect.provideService(CalendarAvailability, advancingProvider),
        Effect.provide(TestClock.layer()),
      ),
    );
    expect(result.candidates).toHaveLength(0);
    expect(result.searchedAt).toBe("2030-01-09T00:00:00Z");
  });

  it("reports a malformed provider response as a typed failure", async () => {
    const invalidProvider: CalendarAvailability["Service"] = {
      query: () => Effect.succeed(null as never),
    };
    const result = await Effect.runPromise(
      MeetingFinder.search({ ...request(), participants: [participant("required", true, 1)] }).pipe(
        Effect.provideService(Directory, directory),
        Effect.provideService(CalendarAvailability, invalidProvider),
        Effect.match({ onSuccess: () => "unexpected success", onFailure: (error) => error.code }),
      ),
    );
    expect(result).toBe("provider_response_invalid");
  });

  it("keeps a malformed individual calendar unknown while other calendars can be used", async () => {
    const invalidProvider: CalendarAvailability["Service"] = {
      query: (_ids, timeMin, timeMax) =>
        Effect.succeed({
          timeMin,
          timeMax,
          calendars: { required: { busy: [] }, optional: { busy: null as never } },
        }),
    };
    const result = await Effect.runPromise(
      MeetingFinder.search({
        ...request(),
        participants: [participant("required", true, 1), participant("optional", false, 1)],
      }).pipe(
        Effect.provideService(Directory, directory),
        Effect.provideService(CalendarAvailability, invalidProvider),
        Effect.provide(TestClock.layer()),
      ),
    );
    expect(result.candidates[0]?.score).toBe(50);
    expect(result.candidates[0]?.participants[1]?.state).toBe("unknown");
    expect(result.calendarsWithErrors[0]?.calendarId).toBe("optional");
  });

  it("ranks candidates and selects non-overlapping options", async () => {
    const result = await runSearch({
      ...request(),
      participants: [
        participant("required", true, 1),
        participant("priority", false, 10),
        participant("other", false, 1),
      ],
    });
    expect(result.validCount).toBeGreaterThan(0);
    expect(result.candidates[0]?.availableWeight).toBe(12);
    expect(result.candidates).toHaveLength(3);
    expect(new Set(result.candidates.map((candidate) => candidate.start)).size).toBe(3);
  });

  it("keeps required conflicts out of candidates and exposes blocked alternatives", async () => {
    const result = await runSearch(
      {
        ...request({ minAttendance: 1, maxResults: 2, bufferMinutes: 10 }),
        participants: [participant("required", true, 10), participant("optional", false, 1)],
      },
      { required: [{ start: "2030-01-07T07:00:00-03:00", end: "2030-01-07T20:00:00-03:00" }] },
    );
    expect(result.candidates.every((candidate) => candidate.requiredConflicts.length === 0)).toBe(
      true,
    );
    expect(
      result.blockedAlternatives.some((candidate) =>
        candidate.requiredConflicts.includes("required"),
      ),
    ).toBe(true);
  });

  it("treats calendar errors as unknown and never as free", async () => {
    const service = {
      query: (calendarIds: ReadonlyArray<string>, timeMin: string, timeMax: string) =>
        Effect.succeed({
          timeMin,
          timeMax,
          calendars: Object.fromEntries(
            calendarIds.map((id) => [
              id,
              id === "required" ? { busy: [], error: "permission denied" } : { busy: [] },
            ]),
          ),
        }),
    } as CalendarAvailability["Service"];
    const result = await Effect.runPromise(
      MeetingFinder.search({
        ...request(),
        participants: [participant("required", true, 1), participant("optional", false, 1)],
      }).pipe(
        Effect.provideService(Directory, directory),
        Effect.provideService(CalendarAvailability, service),
        Effect.provide(TestClock.layer()),
      ),
    );
    expect(result.validCount).toBe(0);
    expect(result.calendarsWithErrors).toEqual([
      { calendarId: "required", detail: "permission denied" },
    ]);
    expect(result.blockedAlternatives[0]?.participants[0]?.state).toBe("unknown");
  });

  it("uses elapsed duration through a daylight-saving transition", async () => {
    const dstParticipant: ParticipantInput = {
      ...participant("dst", true, 1),
      timeZone: "America/New_York",
      workingHours: { start: "01:00", end: "06:00", days: [7] },
    };
    const result = await runSearch({
      startDate: "2030-03-10",
      endDate: "2030-03-10",
      timeZone: "America/New_York",
      durationMinutes: 180,
      stepMinutes: 60,
      minAttendance: 1,
      participants: [dstParticipant],
    });
    const candidate = result.candidates.find((item) => item.participants[0]?.state === "free");
    expect(candidate?.participants[0]?.localStart).toContain("01:00");
    expect(candidate?.participants[0]?.localEnd).toContain("05:00");
  });

  it("keeps an occupied interval outside the buffer boundary free", async () => {
    const result = await runSearch(
      { ...request({ bufferMinutes: 10 }), participants: [participant("required", true, 1)] },
      { required: [{ start: "2030-01-07T08:00:00-03:00", end: "2030-01-07T08:50:00-03:00" }] },
    );
    expect(result.candidates.some((candidate) => candidate.start.includes("12:00:00Z"))).toBe(true);
  });

  it("excludes intervals that start before the controlled clock or finish outside the window", async () => {
    const result = await runSearch({
      ...request({ startDate: "2029-12-01", endDate: "2029-12-01" }),
      participants: [participant("required", true, 1)],
    });
    expect(result.evaluatedCount).toBe(24);
    expect(result.validCount).toBe(0);
  });

  it("classifies a break as outside hours", async () => {
    const person: ParticipantInput = {
      ...participant("break-person", false, 1),
      workingHours: {
        start: "09:00",
        end: "18:00",
        days: [1, 2, 3, 4, 5],
        breakStart: "12:00",
        breakEnd: "13:00",
      },
    };
    const result = await runSearch({
      ...request({ maxResults: 50 }),
      participants: [participant("required", true, 1), person],
    });
    const lunch = result.candidates.find(
      (candidate) =>
        candidate.participants.find((item) => item.participantId === "break-person")?.reason ===
        "working break",
    );
    expect(lunch).toBeDefined();
  });

  it("uses all participant weights in the coverage denominator", async () => {
    const service = {
      query: (calendarIds: ReadonlyArray<string>, timeMin: string, timeMax: string) =>
        Effect.succeed({
          timeMin,
          timeMax,
          calendars: Object.fromEntries(
            calendarIds.map((id) => [
              id,
              id === "optional" ? { busy: [], error: "unavailable" } : { busy: [] },
            ]),
          ),
        }),
    } as CalendarAvailability["Service"];
    const result = await Effect.runPromise(
      MeetingFinder.search({
        ...request(),
        participants: [participant("required", true, 1), participant("optional", false, 1)],
      }).pipe(
        Effect.provideService(Directory, directory),
        Effect.provideService(CalendarAvailability, service),
        Effect.provide(TestClock.layer()),
      ),
    );
    expect(result.candidates[0]?.score).toBe(50);
  });

  it("treats malformed and reversed busy intervals as unknown", async () => {
    const service = {
      query: (calendarIds: ReadonlyArray<string>, timeMin: string, timeMax: string) =>
        Effect.succeed({
          timeMin,
          timeMax,
          calendars: Object.fromEntries(
            calendarIds.map((id) => [
              id,
              id === "required"
                ? {
                    busy: [
                      { start: "not-an-instant", end: "2030-01-07T12:00:00Z" },
                      { start: "2030-01-07T13:00:00Z", end: "2030-01-07T12:00:00Z" },
                    ],
                  }
                : { busy: [] },
            ]),
          ),
        }),
    } as CalendarAvailability["Service"];
    const result = await Effect.runPromise(
      MeetingFinder.search({
        ...request(),
        participants: [participant("required", true, 1), participant("optional", false, 1)],
      }).pipe(
        Effect.provideService(Directory, directory),
        Effect.provideService(CalendarAvailability, service),
        Effect.provide(TestClock.layer()),
      ),
    );
    expect(result.validCount).toBe(0);
    expect(result.calendarsWithErrors).toHaveLength(2);
    expect(result.blockedAlternatives[0]?.participants[0]?.state).toBe("unknown");
  });

  it("preserves busy explanations without trusting malformed Google calendar evidence", async () => {
    const process: GwsProcess = {
      run: (args) => {
        const query = JSON.parse(args[args.indexOf("--json") + 1]!);
        return Effect.succeed({
          exitCode: 0,
          stderr: "",
          stdout: JSON.stringify({
            timeMin: query.timeMin,
            timeMax: query.timeMax,
            calendars: {
              required: {
                busy: [
                  { start: "2030-01-07T09:00:00Z", end: "2030-01-07T10:00:00Z" },
                  { start: "malformed", end: "2030-01-07T12:00:00Z" },
                ],
              },
              missing: {},
              optional: { busy: [] },
            },
          }),
        });
      },
    };
    const layers = Layer.merge(
      Layer.succeed(Directory, directory),
      GwsCalendarAvailabilityLive.pipe(Layer.provide(Layer.succeed(GwsProcessTag, process))),
    ).pipe(Layer.provideMerge(TestClock.layer()));
    const policy = { timeZone: "UTC", workingHours: { start: "09:00", end: "12:00", days: [1] } };
    const result = await Effect.runPromise(
      MeetingFinder.search(
        request({
          timeZone: "UTC",
          maxResults: 5,
          participants: [
            { id: "required", required: true, ...policy },
            { id: "missing", required: false, ...policy },
            { id: "optional", required: false, ...policy },
          ],
        }),
      ).pipe(Effect.provide(layers)),
    );
    expect(result.candidates).toEqual([]);
    const busy = result.blockedAlternatives.find(
      (candidate) => candidate.start === "2030-01-07T09:00:00Z",
    );
    const unknown = result.blockedAlternatives.find(
      (candidate) => candidate.start === "2030-01-07T10:00:00Z",
    );
    expect(busy?.participants[0]).toMatchObject({
      state: "busy",
      ruleSatisfied: false,
      availableIntervals: [],
    });
    expect(unknown?.participants[0]).toMatchObject({
      state: "unknown",
      ruleSatisfied: false,
      availableIntervals: [],
    });
    expect(busy?.participants[1]).toMatchObject({ state: "unknown", ruleSatisfied: false });
    expect(result.calendarsWithErrors.map(({ calendarId }) => calendarId)).toEqual([
      "required",
      "missing",
    ]);
  });

  it("returns provider failures for invalid or incomplete coverage", async () => {
    const service = {
      query: (_calendarIds: ReadonlyArray<string>, timeMin: string, _timeMax: string) =>
        Effect.succeed({ timeMin, timeMax: "2030-01-07T00:00:00Z", calendars: {} }),
    } as CalendarAvailability["Service"];
    await expect(
      Effect.runPromise(
        MeetingFinder.search({
          ...request(),
          participants: [participant("required", true, 1)],
        }).pipe(
          Effect.provideService(Directory, directory),
          Effect.provideService(CalendarAvailability, service),
          Effect.provide(TestClock.layer()),
        ),
      ),
    ).rejects.toMatchObject({ category: "provider", code: "provider_response_invalid" });
  });
});

describe("partial attendance through MeetingFinder.search", () => {
  const partialRequest = (rule: NonNullable<ParticipantInput["attendanceRule"]>): RequestInput => ({
    ...request({ timeZone: "UTC", maxResults: 10 }),
    participants: [
      {
        id: "anchor",
        required: true,
        timeZone: "UTC",
        workingHours: { start: "09:00", end: "10:00", days: [1] },
      },
      {
        id: "flexible",
        required: true,
        timeZone: "UTC",
        attendanceRule: rule,
        workingHours: { start: "09:00", end: "10:00", days: [1] },
      },
    ],
  });
  const busy = (start: string, end: string) => ({
    start: `2030-01-07T${start}Z`,
    end: `2030-01-07T${end}Z`,
  });

  it.each([
    { type: "start" as const, occupied: busy("09:20:00", "10:00:00"), from: "09:00", to: "09:20" },
    { type: "end" as const, occupied: busy("09:00:00", "09:40:00"), from: "09:40", to: "10:00" },
  ])(
    "accepts exactly 20 minutes at the $type and reports the attendance block",
    async ({ type, occupied, from, to }) => {
      const result = await runSearch(partialRequest({ type, minutes: 20 }), {
        flexible: [occupied],
      });
      expect(result.validCount).toBe(1);
      expect(result.candidates[0]).toMatchObject({
        score: 100,
        availableCount: 2,
        requiredConflicts: [],
      });
      expect(result.candidates[0]?.participants[1]).toMatchObject({
        state: "busy",
        ruleSatisfied: true,
        availableMinutes: 20,
        longestAvailableMinutes: 20,
        attendanceInterval: { start: `2030-01-07T${from}:00Z`, end: `2030-01-07T${to}:00Z` },
      });
    },
  );

  it.each(["start", "end"] as const)(
    "does not satisfy %s attendance with a free block in the middle",
    async (type) => {
      const result = await runSearch(partialRequest({ type, minutes: 20 }), {
        flexible: [busy("09:00:00", "09:10:00"), busy("09:50:00", "10:00:00")],
      });
      expect(result.validCount).toBe(0);
      expect(result.blockedAlternatives[0]?.participants[1]).toMatchObject({
        ruleSatisfied: false,
        longestAvailableMinutes: 40,
      });
    },
  );

  it("requires a continuous percentage even when total free portions meet the percentage", async () => {
    const result = await runSearch(partialRequest({ type: "percentage", percent: 50 }), {
      flexible: [busy("09:20:00", "09:40:00")],
    });
    expect(result.validCount).toBe(0);
    expect(result.blockedAlternatives[0]?.participants[1]).toMatchObject({
      ruleSatisfied: false,
      availableMinutes: 40,
      longestAvailableMinutes: 20,
      availableIntervals: [
        { start: "2030-01-07T09:00:00Z", end: "2030-01-07T09:20:00Z" },
        { start: "2030-01-07T09:40:00Z", end: "2030-01-07T10:00:00Z" },
      ],
    });
  });

  it("accepts an exact percentage threshold but not a nanosecond less", async () => {
    const input = partialRequest({ type: "percentage", percent: 50 });
    const exact = await runSearch(input, { flexible: [busy("09:30:00", "10:00:00")] });
    expect(exact.validCount).toBe(1);
    expect(exact.candidates[0]?.participants[1]?.longestAvailablePercentage).toBe(50);
    const short = await runSearch(input, { flexible: [busy("09:29:59.999999999", "10:00:00")] });
    expect(short.validCount).toBe(0);
  });

  it("applies buffers to partial blocks with half-open endpoints", async () => {
    const input = { ...partialRequest({ type: "start", minutes: 20 }), bufferMinutes: 10 };
    const exact = await runSearch(input, { flexible: [busy("09:30:00", "10:00:00")] });
    expect(exact.validCount).toBe(1);
    const short = await runSearch(input, { flexible: [busy("09:29:00", "10:00:00")] });
    expect(short.validCount).toBe(0);
  });

  it("intersects all calendars, subtracting overlapping blocks only once", async () => {
    const input = partialRequest({ type: "percentage", percent: 25 });
    const result = await runSearch(
      {
        ...input,
        participants: input.participants?.map((p) =>
          p.id === "flexible" ? { ...p, calendarIds: ["one", "two"] } : p,
        ),
      },
      {
        one: [busy("09:00:00", "09:20:00"), busy("09:10:00", "09:25:00")],
        two: [busy("09:40:00", "10:00:00")],
      },
    );
    expect(result.validCount).toBe(1);
    expect(result.candidates[0]?.participants[1]).toMatchObject({
      availableMinutes: 15,
      longestAvailableMinutes: 15,
    });
  });

  it("clips partial attendance to working hours and never joins across a break", async () => {
    const input = partialRequest({ type: "percentage", percent: 50 });
    const result = await runSearch({
      ...input,
      participants: input.participants?.map((p) =>
        p.id === "flexible"
          ? {
              ...p,
              workingHours: {
                start: "09:10",
                end: "10:00",
                days: [1],
                breakStart: "09:30",
                breakEnd: "09:40",
              },
            }
          : p,
      ),
    });
    expect(result.validCount).toBe(0);
    expect(result.blockedAlternatives[0]?.participants[1]).toMatchObject({
      state: "outside_hours",
      availableMinutes: 40,
      longestAvailableMinutes: 20,
      ruleSatisfied: false,
    });
  });

  it("does not infer any partial availability from an unknown calendar", async () => {
    const result = await Effect.runPromise(
      MeetingFinder.search(partialRequest({ type: "percentage", percent: 1 })).pipe(
        Effect.provideService(Directory, directory),
        Effect.provideService(CalendarAvailability, {
          query: (_ids, timeMin, timeMax) =>
            Effect.succeed({
              timeMin,
              timeMax,
              calendars: { anchor: { busy: [] }, flexible: { busy: [], error: "denied" } },
            }),
        }),
        Effect.provide(TestClock.layer()),
      ),
    );
    expect(result.validCount).toBe(0);
    expect(result.blockedAlternatives[0]?.participants[1]).toMatchObject({
      ruleSatisfied: false,
      availableIntervals: [],
      availableMinutes: 0,
      longestAvailableMinutes: 0,
    });
  });

  it("counts only satisfied optional rules toward minimum attendance and weighted coverage", async () => {
    const input = partialRequest({ type: "percentage", percent: 50 });
    const participants = input.participants?.map((p) =>
      p.id === "flexible" ? { ...p, required: false, weight: 3 } : p,
    );
    const occupied = { flexible: [busy("09:20:00", "09:40:00")] };
    const low = await runSearch({ ...input, participants }, occupied);
    expect(low.candidates[0]).toMatchObject({ availableCount: 1, score: 25 });
    const strict = await runSearch({ ...input, participants, minAttendance: 2 }, occupied);
    expect(strict.validCount).toBe(0);
    expect(strict.blockedAlternatives[0]?.requiredConflicts).toEqual([]);
    const met = await runSearch(
      { ...input, participants, minAttendance: 2 },
      { flexible: [busy("09:30:00", "10:00:00")] },
    );
    expect(met.candidates[0]).toMatchObject({ availableCount: 2, availableWeight: 4, score: 100 });
  });

  it("validates start/end duration before querying calendars", async () => {
    let queried = false;
    await expect(
      Effect.runPromise(
        MeetingFinder.search(partialRequest({ type: "end", minutes: 61 })).pipe(
          Effect.provideService(Directory, directory),
          Effect.provideService(CalendarAvailability, {
            query: (...args) => {
              queried = true;
              return provider().query(...args);
            },
          }),
        ),
      ),
    ).rejects.toMatchObject({ code: "invalid_search", category: "input" });
    expect(queried).toBe(false);
  });

  it("measures partial attendance in elapsed minutes across a DST transition", async () => {
    const result = await runSearch(
      {
        startDate: "2030-03-10",
        endDate: "2030-03-10",
        timeZone: "America/New_York",
        durationMinutes: 120,
        stepMinutes: 60,
        participants: [
          {
            id: "anchor",
            required: true,
            timeZone: "America/New_York",
            workingHours: { start: "01:00", end: "04:00", days: [7] },
          },
          {
            id: "dst",
            required: true,
            timeZone: "America/New_York",
            attendanceRule: { type: "percentage", percent: 50 },
            workingHours: { start: "01:00", end: "04:00", days: [7] },
          },
        ],
      },
      { dst: [{ start: "2030-03-10T03:00:00-04:00", end: "2030-03-10T04:00:00-04:00" }] },
    );
    const candidate = result.candidates.find((c) => c.start === "2030-03-10T06:00:00Z");
    expect(candidate?.participants[1]).toMatchObject({
      ruleSatisfied: true,
      longestAvailableMinutes: 60,
      longestAvailablePercentage: 50,
    });
  });
});
