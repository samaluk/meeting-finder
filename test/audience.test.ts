import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { MeetingFinder } from "../src/meeting-finder.js";
import { CalendarAvailability, Directory } from "../src/providers.js";
import { providerUnavailable } from "../src/errors.js";

const directory = (members: ReadonlyArray<{ id: string; name?: string }> = []) =>
  ({
    list: () => Effect.succeed([]),
    primary: Effect.succeed("organizer@example.test"),
    expand: () => Effect.succeed({ members, omitted: [] }),
  }) as Directory["Service"];

describe("MeetingFinder.resolve", () => {
  it("unifies sources, applies last source policy, and applies overrides last", async () => {
    const result = await Effect.runPromise(
      MeetingFinder.resolve({
        sources: [
          { type: "emails", ref: "A@example.test; b@example.test", required: true, weight: 2 },
          { type: "emails", ref: "a@example.test", required: false, weight: 7 },
        ],
        overrides: [{ id: "A@example.test", required: true, weight: 10 }],
      }).pipe(Effect.provideService(Directory, directory())),
    );
    expect(result.total).toBe(2);
    expect(
      result.participants.find((participant) => participant.id === "a@example.test"),
    ).toMatchObject({
      required: true,
      weight: 10,
      memberships: ["A@example.test; b@example.test", "a@example.test"],
    });
  });

  it("resolves local person and email sources without external expansion or primary lookup", async () => {
    const localOnly: Directory["Service"] = {
      list: () => Effect.die("local sources must not list collections"),
      primary: Effect.die("primary lookup must remain lazy"),
      expand: () => Effect.die("local sources must not invoke external expansion"),
    };
    const result = await Effect.runPromise(
      MeetingFinder.resolve({
        sources: [
          { type: "person", ref: " A@example.test ", weight: 2 },
          { type: "emails", ref: "B@example.test; a@example.test", required: false, weight: 7 },
        ],
      }).pipe(Effect.provideService(Directory, localOnly)),
    );
    expect(
      result.participants.map(({ id, required, weight }) => ({ id, required, weight })),
    ).toEqual([
      { id: "a@example.test", required: false, weight: 7 },
      { id: "b@example.test", required: false, weight: 7 },
    ]);
    expect(result.sources).toHaveLength(2);
  });

  it("rejects an email source without identities as an input error", async () => {
    await expect(
      Effect.runPromise(
        MeetingFinder.resolve({ sources: [{ type: "emails", ref: ";" }] }).pipe(
          Effect.provideService(Directory, directory()),
        ),
      ),
    ).rejects.toMatchObject({
      category: "input",
      code: "invalid_input",
      detail: "Source produced no members: ;",
    });
  });

  it("keeps participant policy out of external directory expansion", async () => {
    const calls: unknown[] = [];
    const recording: Directory["Service"] = {
      ...directory(),
      expand: (source, aliases) => {
        calls.push({ source, aliases });
        return Effect.succeed({ members: [{ id: "person@example.test" }], omitted: [] });
      },
    };
    const result = await Effect.runPromise(
      MeetingFinder.resolve({
        sources: [{ type: "chat_space", ref: "spaces/team", required: false, weight: 9 }],
        groupAliases: { "groups/team": "team@example.test" },
      }).pipe(Effect.provideService(Directory, recording)),
    );
    expect(calls).toEqual([
      {
        source: { type: "chat_space", ref: "spaces/team" },
        aliases: { "groups/team": "team@example.test" },
      },
    ]);
    expect(result.participants[0]).toMatchObject({
      required: false,
      weight: 9,
      memberships: ["spaces/team"],
    });
  });

  it("canonicalizes the primary identity before deduplication and overrides", async () => {
    const primaryDirectory = {
      ...directory(),
      primary: Effect.succeed("Organizer@Example.test"),
    } as Directory["Service"];
    const result = await Effect.runPromise(
      MeetingFinder.resolve({
        sources: [{ type: "person", ref: "primary" }],
        participants: [{ id: "organizer@example.test" }],
        overrides: [{ id: "organizer@example.test", required: false, weight: 9 }],
      }).pipe(Effect.provideService(Directory, primaryDirectory)),
    );
    expect(result.total).toBe(1);
    expect(result.participants[0]).toMatchObject({
      id: "organizer@example.test",
      required: false,
      weight: 9,
    });
  });

  it("does not require primary identity for ordinary explicit participants", async () => {
    const unavailable = {
      ...directory(),
      primary: Effect.fail(providerUnavailable("primary unavailable", "Retry provider")),
    } as Directory["Service"];
    const result = await Effect.runPromise(
      MeetingFinder.resolve({ participants: [{ id: "person@example.test" }] }).pipe(
        Effect.provideService(Directory, unavailable),
      ),
    );
    expect(result.participants[0]?.id).toBe("person@example.test");
  });

  it("normalizes email calendars, deduplicates them, and resolves primary lazily", async () => {
    let primaryCalls = 0;
    const primaryDirectory = {
      ...directory(),
      primary: Effect.sync(() => {
        primaryCalls++;
        return "Organizer@Example.test";
      }),
    } as Directory["Service"];
    const result = await Effect.runPromise(
      MeetingFinder.resolve({
        participants: [
          {
            id: "person@example.test",
            calendarIds: ["A@EXAMPLE.TEST", "a@example.test", " primary "],
          },
        ],
      }).pipe(Effect.provideService(Directory, primaryDirectory)),
    );
    expect(primaryCalls).toBe(1);
    expect(result.participants[0]?.calendarIds).toEqual([
      "a@example.test",
      "organizer@example.test",
    ]);
  });

  it("rejects blank group aliases at the input boundary", async () => {
    await expect(
      Effect.runPromise(
        MeetingFinder.resolve({
          groupAliases: { " ": "groups/team" },
          participants: [{ id: "person@example.test" }],
        }).pipe(Effect.provideService(Directory, directory())),
      ),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("trims group aliases before search resolution and preserves them in the normalized request", async () => {
    let received: Readonly<Record<string, string>> | undefined;
    const resolvingDirectory = {
      ...directory(),
      expand: (_source: unknown, aliases: Readonly<Record<string, string>>) => {
        received = aliases;
        return Effect.succeed({ members: [{ id: "person@example.test" }], omitted: [] });
      },
    } as Directory["Service"];
    const availability: CalendarAvailability["Service"] = {
      query: (calendarIds, timeMin, timeMax) =>
        Effect.succeed({
          timeMin,
          timeMax,
          calendars: Object.fromEntries(calendarIds.map((id) => [id, { busy: [] }])),
        }),
    };
    const result = await Effect.runPromise(
      MeetingFinder.search({
        startDate: "2030-01-07",
        endDate: "2030-01-07",
        timeZone: "America/Santiago",
        durationMinutes: 60,
        sources: [{ type: "chat_space", ref: "spaces/example" }],
        groupAliases: { " groups/team ": " team@example.test " },
      }).pipe(
        Effect.provideService(Directory, resolvingDirectory),
        Effect.provideService(CalendarAvailability, availability),
      ),
    );
    expect(received).toEqual({ "groups/team": "team@example.test" });
    expect(result.audience.request.groupAliases).toEqual({
      "groups/team": "team@example.test",
    });
  });

  it("rejects group alias keys that collide after trimming during search", async () => {
    await expect(
      Effect.runPromise(
        MeetingFinder.search({
          startDate: "2030-01-07",
          endDate: "2030-01-07",
          timeZone: "America/Santiago",
          durationMinutes: 60,
          participants: [{ id: "person@example.test" }],
          groupAliases: { "groups/team": "one@example.test", " groups/team ": "two@example.test" },
        }).pipe(
          Effect.provideService(Directory, directory()),
          Effect.provideService(CalendarAvailability, {
            query: () => Effect.die("should not query") as never,
          }),
        ),
      ),
    ).rejects.toMatchObject({ code: "invalid_input", issues: expect.any(Array) });
  });

  it("rejects duplicate explicit participants and unmatched overrides", async () => {
    const duplicate = MeetingFinder.resolve({
      participants: [{ id: "a@example.test" }, { id: "A@example.test" }],
    }).pipe(Effect.provideService(Directory, directory()));
    await expect(Effect.runPromise(duplicate)).rejects.toMatchObject({ code: "invalid_input" });

    const unmatched = MeetingFinder.resolve({
      participants: [{ id: "a@example.test" }],
      overrides: [{ id: "missing@example.test", required: true }],
    }).pipe(Effect.provideService(Directory, directory()));
    await expect(Effect.runPromise(unmatched)).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("allows an all-optional resolved audience and applies defaults only when fields are absent", async () => {
    const result = await Effect.runPromise(
      MeetingFinder.resolve({
        participantDefaults: {
          timeZone: "America/New_York",
          workingHours: { start: "08:00", end: "17:00", days: [1, 2, 3, 4, 5] },
        },
        participants: [
          { id: "one@example.test", required: false },
          {
            id: "two@example.test",
            required: false,
            timeZone: "UTC",
            workingHours: { start: "10:00", end: "11:00", days: [1] },
          },
        ],
      }).pipe(Effect.provideService(Directory, directory())),
    );
    expect(result.requiredCount).toBe(0);
    expect(result.participants[0]).toMatchObject({
      timeZone: "America/New_York",
      workingHours: { start: "08:00" },
    });
    expect(result.participants[1]).toMatchObject({
      timeZone: "UTC",
      workingHours: { start: "10:00" },
    });
  });

  it("rejects invalid audience limits and policy values", async () => {
    const tooMany = Array.from({ length: 101 }, (_, index) => ({ id: `p${index}@example.test` }));
    await expect(
      Effect.runPromise(
        MeetingFinder.resolve({ participants: tooMany }).pipe(
          Effect.provideService(Directory, directory()),
        ),
      ),
    ).rejects.toMatchObject({ code: "invalid_input" });
    await expect(
      Effect.runPromise(
        MeetingFinder.resolve({ participants: [{ id: "x@example.test", calendarIds: [] }] }).pipe(
          Effect.provideService(Directory, directory()),
        ),
      ),
    ).rejects.toMatchObject({ code: "invalid_input" });
    await expect(
      Effect.runPromise(
        MeetingFinder.resolve({
          participants: [
            { id: "x@example.test", workingHours: { start: "18:00", end: "09:00", days: [1] } },
          ],
        }).pipe(Effect.provideService(Directory, directory())),
      ),
    ).rejects.toMatchObject({ code: "invalid_input" });
    await expect(
      Effect.runPromise(
        MeetingFinder.resolve({
          participants: [{ id: "x@example.test", timeZone: "Not/AZone" }],
        }).pipe(Effect.provideService(Directory, directory())),
      ),
    ).rejects.toMatchObject({ code: "invalid_input" });
    const manySources = Array.from({ length: 21 }, (_, index) => ({
      type: "emails" as const,
      ref: `p${index}@example.test`,
    }));
    await expect(
      Effect.runPromise(
        MeetingFinder.resolve({ sources: manySources }).pipe(
          Effect.provideService(Directory, directory()),
        ),
      ),
    ).rejects.toMatchObject({ code: "invalid_input" });
    const manyOverrides = Array.from({ length: 101 }, (_, index) => ({
      id: `p${index}@example.test`,
    }));
    await expect(
      Effect.runPromise(
        MeetingFinder.resolve({
          participants: [{ id: "p0@example.test" }],
          overrides: manyOverrides,
        }).pipe(Effect.provideService(Directory, directory())),
      ),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("rejects a source expansion failure without returning a partial audience", async () => {
    const failing = {
      ...directory(),
      expand: () => Effect.fail(providerUnavailable("incomplete", "retry")),
    } as Directory["Service"];
    await expect(
      Effect.runPromise(
        MeetingFinder.resolve({ sources: [{ type: "chat_space", ref: "spaces/one" }] }).pipe(
          Effect.provideService(Directory, failing),
        ),
      ),
    ).rejects.toMatchObject({ code: "provider_unavailable" });
  });
});

describe("attendance rule resolution", () => {
  it("retains sibling validation paths and specific working-hour failure messages", async () => {
    await expect(
      Effect.runPromise(
        MeetingFinder.resolve({
          participants: [
            {
              id: "one@example.test",
              attendanceRule: { type: "percentage", percent: 0 },
              workingHours: { start: "18:00", end: "09:00", days: [1], breakStart: "12:00" },
            },
          ],
        }).pipe(Effect.provideService(Directory, directory())),
      ),
    ).rejects.toMatchObject({
      code: "invalid_input",
      issues: expect.arrayContaining([
        expect.objectContaining({ path: ["participants", 0, "attendanceRule", "percent"] }),
        {
          path: ["participants", 0, "workingHours", "end"],
          message: "Working hours must end after they start",
        },
        {
          path: ["participants", 0, "workingHours", "breakEnd"],
          message: "Provide both break endpoints",
        },
      ]),
    });
  });

  it("rejects impossible dates and timezones in search before consulting providers", async () => {
    await expect(
      Effect.runPromise(
        MeetingFinder.search({
          startDate: "2030-02-30",
          endDate: "2030-03-01",
          timeZone: "Not/AZone",
          durationMinutes: 60,
          participants: [{ id: "one@example.test" }],
        }).pipe(
          Effect.provideService(Directory, directory()),
          Effect.provideService(CalendarAvailability, {
            query: () => Effect.die("Invalid input must not query availability"),
          }),
        ),
      ),
    ).rejects.toMatchObject({
      code: "invalid_input",
      issues: expect.arrayContaining([
        expect.objectContaining({ path: ["startDate"] }),
        expect.objectContaining({ path: ["timeZone"] }),
      ]),
    });
  });

  it("defaults to full attendance and applies explicit policy then ordered overrides", async () => {
    const result = await Effect.runPromise(
      MeetingFinder.resolve({
        sources: [{ type: "emails", ref: "one@example.test two@example.test three@example.test" }],
        participantDefaults: { attendanceRule: { type: "percentage", percent: 75 } },
        participants: [{ id: "two@example.test", attendanceRule: { type: "start", minutes: 15 } }],
        overrides: [
          { id: "three@example.test", attendanceRule: { type: "end", minutes: 20 } },
          { id: "three@example.test", attendanceRule: { type: "full" } },
        ],
      }).pipe(Effect.provideService(Directory, directory())),
    );
    expect(result.participants.map((p) => p.attendanceRule)).toEqual([
      { type: "percentage", percent: 75 },
      { type: "start", minutes: 15 },
      { type: "full" },
    ]);
    const defaults = await Effect.runPromise(
      MeetingFinder.resolve({
        participants: [{ id: "one@example.test" }],
      }).pipe(Effect.provideService(Directory, directory())),
    );
    expect(defaults.participants[0]?.attendanceRule).toEqual({ type: "full" });
  });

  it.each([
    { type: "percentage", percent: 0 },
    { type: "percentage", percent: 101 },
    { type: "percentage", percent: 50.5 },
    { type: "start", minutes: 0 },
    { type: "end", minutes: 481 },
    { type: "start" },
    { type: "fragmented", percent: 50 },
  ])("rejects invalid attendance rule %j", async (attendanceRule) => {
    await expect(
      Effect.runPromise(
        MeetingFinder.resolve({
          participants: [{ id: "one@example.test", attendanceRule }],
        }).pipe(Effect.provideService(Directory, directory())),
      ),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("retains nested schema paths for invalid attendance values", async () => {
    try {
      await Effect.runPromise(
        MeetingFinder.resolve({
          participants: [
            { id: "one@example.test", attendanceRule: { type: "percentage", percent: 0 } },
          ],
        }).pipe(Effect.provideService(Directory, directory())),
      );
      throw new Error("expected validation failure");
    } catch (error) {
      expect(error).toMatchObject({ code: "invalid_input" });
      expect(
        (error as { issues: ReadonlyArray<{ path: ReadonlyArray<string | number> }> }).issues,
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: ["participants", 0, "attendanceRule", "percent"] }),
        ]),
      );
    }
  });
});
