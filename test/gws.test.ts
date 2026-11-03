import { Effect, Exit, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { GwsCalendarAvailabilityLive, GwsDirectoryLive } from "../src/adapters/gws.js";
import { GwsProcessTag, type GwsProcess } from "../src/adapters/gws-process.js";
import { CalendarAvailability, Directory } from "../src/providers.js";

const directory = (process: GwsProcess) =>
  Effect.runSync(
    Directory.pipe(
      Effect.provide(GwsDirectoryLive.pipe(Layer.provide(Layer.succeed(GwsProcessTag, process)))),
    ),
  );
const calendarAvailability = (process: GwsProcess) =>
  Effect.runSync(
    CalendarAvailability.pipe(
      Effect.provide(
        GwsCalendarAvailabilityLive.pipe(Layer.provide(Layer.succeed(GwsProcessTag, process))),
      ),
    ),
  );

const fake = (values: ReadonlyArray<unknown>) => {
  let index = 0;
  const calls: Array<ReadonlyArray<string>> = [];
  const process: GwsProcess = {
    run: (args) => {
      calls.push(args);
      const value = values[index++];
      return value === undefined
        ? Effect.fail(new Error("unexpected call") as never)
        : Effect.succeed({ stdout: JSON.stringify(value), stderr: "", exitCode: 0 });
    },
  };
  return { process, calls };
};
const jsonArg = (args: ReadonlyArray<string>, flag: string) =>
  JSON.parse(args[args.indexOf(flag) + 1] ?? "null") as Record<string, unknown>;

describe("gws directory adapter", () => {
  it("uses Chat memberships, People lookup, and follows pages", async () => {
    const f = fake([
      {
        memberships: [
          { state: "JOINED", member: { name: "users/1", type: "HUMAN" } },
          { state: "JOINED", member: { name: "users/bot", type: "BOT" } },
        ],
        nextPageToken: "next",
      },
      {
        memberships: [
          { state: "JOINED", member: { name: "users/2", type: "HUMAN" } },
          { state: "INVITED", member: { name: "users/3", type: "HUMAN" } },
        ],
      },
      {
        responses: [
          {
            person: {
              resourceName: "people/1",
              names: [{ displayName: "A" }],
              emailAddresses: [{ value: "A@EXAMPLE.TEST", metadata: { primary: true } }],
            },
          },
          {
            person: {
              resourceName: "people/2",
              names: [{ displayName: "B" }],
              emailAddresses: [{ value: "b@example.test", metadata: { primary: true } }],
            },
          },
        ],
      },
    ]);
    const result = await Effect.runPromise(
      directory(f.process).expand(
        { type: "chat_space", ref: "https://chat.google.com/room/demo" },
        {},
      ),
    );
    expect(result.members.map((m) => m.id)).toEqual(["a@example.test", "b@example.test"]);
    expect(f.calls[0]?.slice(0, 4)).toEqual(["chat", "spaces", "members", "list"]);
    expect(jsonArg(f.calls[0] ?? [], "--params")).toMatchObject({
      parent: "spaces/demo",
      pageSize: 100,
    });
    expect(f.calls[2]?.slice(0, 3)).toEqual(["people", "people", "getBatchGet"]);
  });

  it.each([42, {}, ""])(
    "rejects malformed pagination token %j instead of truncating the source",
    async (nextPageToken) => {
      const f = fake([{ memberships: [], nextPageToken }]);
      const exit = await Effect.runPromiseExit(
        directory(f.process).expand({ type: "chat_space", ref: "spaces/example" }, {}),
      );
      expect(Exit.isFailure(exit)).toBe(true);
      expect(f.calls).toHaveLength(1);
    },
  );

  it("expands Google Groups through freebusy request body", async () => {
    const f = fake([
      { groups: { "team@example.test": { calendars: ["A@EXAMPLE.TEST", "b@example.test"] } } },
    ]);
    const result = await Effect.runPromise(
      directory(f.process).expand({ type: "google_group", ref: "team@example.test" }, {}),
    );
    expect(result.members.map((m) => m.id)).toEqual(["a@example.test", "b@example.test"]);
    expect(f.calls[0]).toContain("--json");
    expect(jsonArg(f.calls[0] ?? [], "--json")).toMatchObject({
      items: [{ id: "team@example.test" }],
      groupExpansionMax: 100,
      calendarExpansionMax: 50,
    });
  });

  it("uses Contacts get then People batch lookup and rejects ambiguous emails", async () => {
    const f = fake([
      { resourceName: "contactGroups/friends", memberResourceNames: ["people/1"] },
      {
        responses: [
          {
            person: {
              resourceName: "people/1",
              names: [{ displayName: "A" }],
              emailAddresses: [{ value: "a@example.test", metadata: { primary: true } }],
            },
          },
        ],
      },
    ]);
    const result = await Effect.runPromise(
      directory(f.process).expand({ type: "contact_group", ref: "contactGroups/friends" }, {}),
    );
    expect(result.members[0]?.id).toBe("a@example.test");
    expect(jsonArg(f.calls[0] ?? [], "--params")).toMatchObject({
      resourceName: "contactGroups/friends",
      maxMembers: 100,
    });
    const bad = fake([
      { resourceName: "contactGroups/friends", memberResourceNames: ["people/1"] },
      {
        responses: [
          {
            person: { emailAddresses: [{ value: "a@example.test" }, { value: "b@example.test" }] },
          },
        ],
      },
    ]);
    expect(
      Exit.isFailure(
        await Effect.runPromiseExit(
          directory(bad.process).expand(
            { type: "contact_group", ref: "contactGroups/friends" },
            {},
          ),
        ),
      ),
    ).toBe(true);
  });

  it("resolves primary through calendar calendars.get", async () => {
    const f = fake([{ id: "Primary@Example.test" }]);
    expect(await Effect.runPromise(directory(f.process).primary)).toBe("primary@example.test");
    expect(jsonArg(f.calls[0] ?? [], "--params")).toEqual({ calendarId: "primary" });
  });
});

describe("gws calendar adapter", () => {
  it("batches at fifty and sends freebusy POST JSON bodies", async () => {
    const ids = Array.from({ length: 51 }, (_, i) => `p${i}@example.test`);
    const f = fake([
      {
        timeMin: "2030-01-01T00:00:00Z",
        timeMax: "2030-01-02T00:00:00Z",
        calendars: Object.fromEntries(ids.slice(0, 50).map((id) => [id, { busy: [] }])),
      },
      {
        timeMin: "2030-01-01T00:00:00Z",
        timeMax: "2030-01-02T00:00:00Z",
        calendars: { [ids[50] as string]: { busy: [] } },
      },
    ]);
    const result = await Effect.runPromise(
      calendarAvailability(f.process).query(ids, "2030-01-01T00:00:00Z", "2030-01-02T00:00:00Z"),
    );
    expect(Object.keys(result.calendars)).toHaveLength(51);
    expect(f.calls).toHaveLength(2);
    expect(jsonArg(f.calls[0] ?? [], "--json")).toMatchObject({
      timeMin: "2030-01-01T00:00:00Z",
    });
    expect((jsonArg(f.calls[0] ?? [], "--json").items as Array<{ id: string }>)[0]?.id).toBe(
      ids[0],
    );
  });

  it("classifies calendar errors and marks omitted calendars unknown", async () => {
    const f = fake([
      {
        timeMin: "2030-01-01T00:00:00Z",
        timeMax: "2030-01-02T00:00:00Z",
        calendars: {
          "a@example.test": { busy: [], errors: [{ domain: "calendar", reason: "forbidden" }] },
        },
      },
    ]);
    const result = await Effect.runPromise(
      calendarAvailability(f.process).query(
        ["a@example.test", "b@example.test"],
        "2030-01-01T00:00:00Z",
        "2030-01-02T00:00:00Z",
      ),
    );
    expect(result.calendars["a@example.test"]?.error).toBe("calendar access failed");
    expect(result.calendars["b@example.test"]?.error).toContain("omitted");
  });

  it("retains known busy intervals when other evidence for that calendar is malformed", async () => {
    const f = fake([
      {
        timeMin: "2030-01-01T00:00:00Z",
        timeMax: "2030-01-02T00:00:00Z",
        calendars: {
          a: {
            busy: [
              { start: "bad", end: "2030-01-01T02:00:00Z" },
              { start: "2030-01-01T02:00:00Z", end: "2030-01-01T03:00:00Z" },
              { start: "2030-01-01T05:00:00Z", end: "2030-01-01T04:00:00Z" },
            ],
          },
          b: {},
        },
      },
    ]);
    const result = await Effect.runPromise(
      calendarAvailability(f.process).query(
        ["a", "b"],
        "2030-01-01T00:00:00Z",
        "2030-01-02T00:00:00Z",
      ),
    );
    expect(result.calendars.a).toEqual({
      busy: [{ start: "2030-01-01T02:00:00Z", end: "2030-01-01T03:00:00Z" }],
      error: "calendar busy response is malformed",
    });
    expect(result.calendars.b).toEqual({ busy: [], error: "calendar busy response is malformed" });
  });

  it("rejects incomplete coverage in any calendar batch", async () => {
    const ids = Array.from({ length: 51 }, (_, i) => `p${i}@example.test`);
    const f = fake([
      { timeMin: "2030-01-01T00:00:00Z", timeMax: "2030-01-02T00:00:00Z", calendars: {} },
      { timeMin: "2030-01-01T00:00:00Z", timeMax: "2030-01-01T23:00:00Z", calendars: {} },
    ]);
    await expect(
      Effect.runPromise(
        calendarAvailability(f.process).query(ids, "2030-01-01T00:00:00Z", "2030-01-02T00:00:00Z"),
      ),
    ).rejects.toMatchObject({ code: "provider_response_invalid", category: "provider" });
    expect(f.calls).toHaveLength(2);
  });

  it("marks malformed per-calendar data unknown while retaining usable calendars", async () => {
    const malformed = fake([
      {
        timeMin: "2030-01-01T00:00:00Z",
        timeMax: "2030-01-02T00:00:00Z",
        calendars: {
          a: { busy: [{ start: "2030-01-01T02:00:00Z", end: "2030-01-01T01:00:00Z" }] },
          b: { busy: [{ start: "2030-01-01T02:00:00Z", end: "2030-01-01T03:00:00Z" }] },
        },
      },
    ]);
    const result = await Effect.runPromise(
      calendarAvailability(malformed.process).query(
        ["a", "b"],
        "2030-01-01T00:00:00Z",
        "2030-01-02T00:00:00Z",
      ),
    );
    expect(result.calendars.a?.busy).toEqual([]);
    expect(result.calendars.a?.error).toContain("malformed");
    expect(result.calendars.b?.busy).toHaveLength(1);
    const malformedError = fake([
      {
        timeMin: "2030-01-01T00:00:00Z",
        timeMax: "2030-01-02T00:00:00Z",
        calendars: { a: { busy: [], errors: ["denied"] } },
      },
    ]);
    const errorResult = await Effect.runPromise(
      calendarAvailability(malformedError.process).query(
        ["a"],
        "2030-01-01T00:00:00Z",
        "2030-01-02T00:00:00Z",
      ),
    );
    expect(errorResult.calendars.a?.busy).toEqual([]);
    expect(errorResult.calendars.a?.error).toContain("malformed");
  });
});

describe("provider diagnostics privacy", () => {
  it.each([
    ["401 unauthorized", 1, "gws authentication failed"],
    ["403 permission denied", 1, "gws access was denied"],
    ["503 temporarily unavailable", 1, "gws is temporarily unavailable"],
    ["unexpected provider output", 1, "gws command failed"],
  ])("classifies %s without forwarding private stderr", async (reason, exitCode, detail) => {
    const service = directory({
      run: () =>
        Effect.succeed({
          stdout: "",
          exitCode,
          stderr: `${reason}; bearer diagnostic-sentinel; private@example.test; /private/config`,
        }),
    });
    const result = await Effect.runPromise(service.primary.pipe(Effect.result));
    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") {
      expect(result.failure.detail).toBe(detail);
      expect(JSON.stringify(result.failure)).not.toContain("diagnostic-sentinel");
      expect(JSON.stringify(result.failure)).not.toContain("private@example.test");
      expect(JSON.stringify(result.failure)).not.toContain("/private/config");
    }
  });
});
