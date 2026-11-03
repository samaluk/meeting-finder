import { describe, expect, it } from "vitest";
import type {
  MeetingCandidate,
  ResolvedSearchAudience,
  ResolvedParticipant,
} from "../src/contracts.js";
import { Message, initial, isLoading, update, type Model } from "../web/app.js";

const commandNamed = (
  commands:
    | ReadonlyArray<{ readonly name: string; readonly args?: Record<string, unknown> }>
    | undefined,
  name: string,
) => commands?.find((command) => command.name === name);

const person = (id: string, required = true): ResolvedParticipant => ({
  id,
  required,
  weight: 1,
  attendanceRule: { type: "full" },
  timeZone: "UTC",
  workingHours: { start: "09:00", end: "18:00", days: [1, 2, 3, 4, 5] },
  calendarIds: [id],
  memberships: ["source/example"],
});
const candidate: MeetingCandidate = {
  start: "2030-01-07T09:00:00Z",
  end: "2030-01-07T10:00:00Z",
  score: 100,
  availableWeight: 1,
  totalWeight: 1,
  availableCount: 1,
  attendance: 1,
  requiredConflicts: [],
  participants: [
    {
      participantId: "p1@example.test",
      state: "free",
      localStart: "09:00",
      localEnd: "10:00",
      attendanceRule: { type: "full" },
      ruleSatisfied: true,
      availableIntervals: [{ start: "2030-01-07T09:00:00Z", end: "2030-01-07T10:00:00Z" }],
      availableMinutes: 60,
      longestAvailableMinutes: 60,
      longestAvailablePercentage: 100,
    },
  ],
};
const audience: ResolvedSearchAudience = {
  request: {
    startDate: "2030-01-07",
    endDate: "2030-01-08",
    timeZone: "UTC",
    durationMinutes: 60,
    stepMinutes: 15,
    bufferMinutes: 0,
    minAttendance: 1,
    maxResults: 12,
  },
  participants: [],
  sources: [],
  total: 0,
  requiredCount: 0,
  optionalCount: 0,
  overrides: [],
};

describe("web update contract", () => {
  it("interrupts config and in-flight requests when an edit invalidates them", () => {
    const result = update(initial, Message.ChangedRule({ field: "duration", value: "90" }));
    expect(result.commands?.map((command) => command.name)).toEqual([
      "Config.Interrupt",
      "Resolve.Interrupt",
      "Search.Interrupt",
    ]);
  });

  it("ignores stale resolve success and search errors after a rule edit", () => {
    const resolving = update(
      { ...initial, people: [person("old@example.test")] },
      Message.ClickedResolve(),
    );
    const edited = update(resolving.model, Message.ChangedRule({ field: "duration", value: "90" }));
    const staleResolve = update(
      edited.model,
      Message.Resolved({
        people: [person("stale@example.test")],
        revision: resolving.model.revision,
        operation: resolving.model.operation,
      }),
    );
    expect(staleResolve.model.people[0]?.id).toBe("old@example.test");

    const searching = update(edited.model, Message.ClickedSearch());
    const changed = update(searching.model, Message.ChangedRule({ field: "buffer", value: "20" }));
    const staleError = update(
      changed.model,
      Message.Failed({
        error: "stale",
        revision: searching.model.revision,
        operation: searching.model.operation,
      }),
    );
    expect(staleError.model.error).toBeNull();
  });

  it("clears candidates on edits and cannot copy an invalidated proposal", () => {
    const model = {
      ...initial,
      people: [person("p1@example.test")],
      searchResult: {
        audience,
        timeZone: "UTC",
        searchedAt: "2030-01-07T00:00:00Z",
        candidates: [candidate],
        blockedAlternatives: [],
        evaluatedCount: 1,
        validCount: 1,
        calendarsWithErrors: [],
      },
    };
    const edited = update(model, Message.ChangedRule({ field: "step", value: "30" }));
    expect(edited.model.searchResult).toBeNull();
    expect(edited.model.searchResult).toBeNull();
    const copy = update(edited.model, Message.ClickedCopy({ index: 0 }));
    expect(copy.commands ?? []).toHaveLength(0);
  });

  it("applies bulk required changes to the complete audience despite filtering", () => {
    const model = {
      ...initial,
      people: [person("one@example.test"), person("two@example.test", false)],
    };
    const filtered = update(model, Message.ChangedFilter({ value: "one" }));
    const allOptional = update(filtered.model, Message.SetRequired({ required: false }));
    expect(allOptional.model.people.every((participant) => !participant.required)).toBe(true);
  });

  it("searches a prepared snapshot without sending sources", () => {
    const model = {
      ...initial,
      sources: [{ type: "person" as const, ref: "stale@example.test" }],
      people: [person("p1@example.test")],
    };
    const removed = update(model, Message.RemovedSource({ index: 0 }));
    const search = update(removed.model, Message.ClickedSearch());
    const started = update(
      search.model,
      Message.SearchCancelled({
        revision: search.model.revision,
        operation: search.model.operation,
      }),
    );
    const body = commandNamed(started.commands, "Search")?.args?.body as Record<string, unknown>;
    expect(body.sources).toBeUndefined();
    const { memberships: _memberships, ...expected } = person("p1@example.test");
    expect(body.participants).toEqual([expected]);
  });

  it("imports a participant snapshot without changing meeting rules", () => {
    const model = {
      ...initial,
      startDate: "2030-01-01",
      endDate: "2030-01-03",
      step: 30,
      maxResults: 5,
      snapshotDraft: JSON.stringify({ participants: [person("imported@example.test")] }),
    };
    const imported = update(model, Message.ClickedImport());
    expect(imported.model.people).toHaveLength(0);
    const resolve = commandNamed(
      update(
        imported.model,
        Message.ResolveCancelled({
          revision: imported.model.revision,
          operation: imported.model.operation,
        }),
      ).commands,
      "Resolve",
    );
    expect(resolve?.args?.body).toMatchObject({
      participants: [expect.objectContaining({ id: "imported@example.test" })],
    });
    expect(imported.model.startDate).toBe("2030-01-01");
    expect(imported.model.step).toBe(30);
    expect(imported.model.maxResults).toBe(5);
  });

  it("preserves nested schema paths when a snapshot has an invalid attendance rule", () => {
    const result = update(
      {
        ...initial,
        snapshotDraft: JSON.stringify({
          participants: [
            { id: "p1@example.test", attendanceRule: { type: "percentage", percent: 0 } },
          ],
        }),
      },
      Message.ClickedImport(),
    );
    expect(result.model.error).toContain("participants.0.attendanceRule.percent");
  });

  it("exports only the participant snapshot fields", () => {
    const model = {
      ...initial,
      sources: [{ type: "person" as const, ref: "source@example.test" }],
      overrides: [{ id: "p1@example.test", required: false }],
      people: [person("p1@example.test")],
    };
    const result = update(model, Message.ClickedDownload());
    const text = result.commands?.[0]?.args?.text as string;
    const snapshot = JSON.parse(text) as {
      sources?: unknown;
      overrides?: unknown;
      participants: Array<Record<string, unknown>>;
    };
    expect(snapshot.sources).toBeUndefined();
    expect(snapshot.overrides).toBeUndefined();
    expect(snapshot.participants[0]?.memberships).toBeUndefined();
  });

  it("does not offer blocked alternatives as copy commands", () => {
    const model = {
      ...initial,
      searchResult: {
        audience,
        timeZone: "UTC",
        searchedAt: "2030-01-07T00:00:00Z",
        candidates: [],
        blockedAlternatives: [candidate],
        evaluatedCount: 1,
        validCount: 0,
        calendarsWithErrors: [],
      },
      people: [person("p1@example.test")],
    };
    const result = update(model, Message.ClickedCopy({ index: 0 }));
    expect(result.commands ?? []).toHaveLength(0);
  });

  it("hydrates prepared participants from config without starting a search", () => {
    const result = update(
      initial,
      Message.Configured({
        revision: 0,
        operation: 0,
        mode: "demo",
        config: {
          timeZone: "America/Santiago",
          participants: [{ id: "prepared@example.test", required: true, weight: 7 }],
        },
      }),
    );
    expect(result.model.mode).toBe("demo");
    expect(result.model.people).toHaveLength(0);
    expect(result.commands ?? []).toHaveLength(1);
    expect(result.commands?.[0]?.args?.body).toMatchObject({
      participants: [{ id: "prepared@example.test", required: true, weight: 7 }],
    });
  });

  it("copies conflicts and demo status for a valid proposal", () => {
    const result = update(
      {
        ...initial,
        mode: "demo",
        people: [person("p1@example.test")],
        searchResult: {
          audience,
          timeZone: "UTC",
          searchedAt: "2030-01-07T00:00:00Z",
          candidates: [candidate],
          blockedAlternatives: [],
          evaluatedCount: 1,
          validCount: 1,
          calendarsWithErrors: [],
        },
      },
      Message.ClickedCopy({ index: 0 }),
    );
    const text = result.commands?.[0]?.args?.text as string;
    expect(text).toContain("Conflicts: None");
    expect(text).toContain("Simulated: true");
  });

  it("retains search metadata, including evaluated and provider-error details", () => {
    const clicked = update(initial, Message.ClickedSearch());
    const running = update(
      clicked.model,
      Message.SearchCancelled({
        revision: clicked.model.revision,
        operation: clicked.model.operation,
      }),
    );
    const result = update(
      running.model,
      Message.ReceivedSearch({
        result: {
          audience,
          timeZone: "UTC",
          searchedAt: "2030-01-07T12:00:00Z",
          candidates: [candidate],
          blockedAlternatives: [],
          evaluatedCount: 24,
          validCount: 7,
          calendarsWithErrors: [{ calendarId: "broken@example.test", detail: "timeout" }],
        },
        revision: running.model.revision,
        operation: running.model.operation,
      }),
    );
    expect(result.model.searchResult?.evaluatedCount).toBe(24);
    expect(result.model.searchResult?.validCount).toBe(7);
    expect(result.model.searchResult?.calendarsWithErrors[0]?.calendarId).toBe(
      "broken@example.test",
    );
  });

  it("imports its own downloaded snapshot with the same participants and meeting rules", () => {
    const prepared = {
      ...initial,
      startDate: "2030-01-07",
      endDate: "2030-01-08",
      duration: 90,
      buffer: 20,
      step: 30,
      maxResults: 5,
      people: [person("p1@example.test")],
    };
    const downloaded = update(prepared, Message.ClickedDownload());
    const text = downloaded.commands?.[0]?.args?.text as string;
    const imported = update({ ...initial, snapshotDraft: text }, Message.ClickedImport());
    expect(imported.model.error).toBeNull();
    expect(imported.model).toMatchObject({
      startDate: "2030-01-07",
      endDate: "2030-01-08",
      duration: 90,
      buffer: 20,
      step: 30,
      maxResults: 5,
    });
    expect(
      commandNamed(
        update(
          imported.model,
          Message.ResolveCancelled({
            revision: imported.model.revision,
            operation: imported.model.operation,
          }),
        ).commands,
        "Resolve",
      )?.args?.body,
    ).toEqual(JSON.parse(text));
    expect(JSON.parse(text).participants[0].memberships).toBeUndefined();
  });

  it("rejects source-only imports and ignores errors from the initial revision after edits", () => {
    const imported = update(
      {
        ...initial,
        snapshotDraft: JSON.stringify({ sources: [{ type: "person", ref: "p1@example.test" }] }),
      },
      Message.ClickedImport(),
    );
    expect(imported.model.error).toContain("participant snapshot");
    expect(imported.commands ?? []).toHaveLength(0);
    const edited = update(initial, Message.ChangedRule({ field: "duration", value: "30" }));
    const stale = update(
      edited.model,
      Message.Failed({ error: "obsolete", revision: 0, operation: 1 }),
    );
    expect(stale.model.error).toBeNull();
  });

  it("keeps source defaults and aliases when resolving prepared configuration again", () => {
    const config = {
      sources: [{ type: "chat_space" as const, ref: "spaces/example" }],
      participantDefaults: { timeZone: "UTC" },
      groupAliases: { "groups/team": "team@example.test" },
    };
    const configured = update(
      initial,
      Message.Configured({ config, mode: "demo", revision: 0, operation: 0 }),
    );
    const again = update(configured.model, Message.ClickedResolve());
    expect(
      commandNamed(
        update(
          again.model,
          Message.ResolveCancelled({
            revision: again.model.revision,
            operation: again.model.operation,
          }),
        ).commands,
        "Resolve",
      )?.args?.body,
    ).toMatchObject(config);
  });
});

describe("web request lifecycle", () => {
  const token = ({ revision, operation }: Model) => ({ revision, operation });
  const result = {
    audience,
    timeZone: "UTC",
    searchedAt: "2030-01-07T00:00:00Z",
    candidates: [candidate],
    blockedAlternatives: [],
    evaluatedCount: 1,
    validCount: 1,
    calendarsWithErrors: [],
  };
  const startSearch = (model: Model = initial) => {
    const clicked = update(model, Message.ClickedSearch());
    return update(clicked.model, Message.SearchCancelled(token(clicked.model)));
  };

  it("accepts only the matching acknowledgement, once, before starting a request", () => {
    const clicked = update(initial, Message.ClickedResolve());
    const wrong = update(clicked.model, Message.SearchCancelled(token(clicked.model)));
    expect(wrong.model).toBe(clicked.model);
    expect(wrong.commands ?? []).toHaveLength(0);
    const premature = update(
      clicked.model,
      Message.Resolved({
        ...token(clicked.model),
        people: [person("premature@example.test")],
      }),
    );
    expect(premature.model).toBe(clicked.model);
    const started = update(clicked.model, Message.ResolveCancelled(token(clicked.model)));
    expect(started.commands?.map((command) => command.name)).toEqual(["Resolve"]);
    const duplicate = update(started.model, Message.ResolveCancelled(token(started.model)));
    expect(duplicate.model).toBe(started.model);
    expect(duplicate.commands ?? []).toHaveLength(0);
    const wrongSearch = update(
      started.model,
      Message.ReceivedSearch({
        ...token(started.model),
        result,
      }),
    );
    expect(wrongSearch.model).toBe(started.model);
    const completed = update(
      started.model,
      Message.Resolved({
        ...token(started.model),
        people: [person("current@example.test")],
      }),
    );
    expect(completed.model.people[0]?.id).toBe("current@example.test");
    const lateFailure = update(
      completed.model,
      Message.Failed({
        ...token(completed.model),
        error: "already completed",
      }),
    );
    expect(lateFailure.model).toBe(completed.model);
  });

  it("imports a snapshot while searching and rejects the replaced search's response", () => {
    const running = startSearch({ ...initial, searchResult: result });
    const draft = update(
      running.model,
      Message.ChangedSnapshot({
        value: JSON.stringify({
          participants: [{ id: "imported@example.test", required: false }],
          durationMinutes: 45,
        }),
      }),
    );
    const imported = update(draft.model, Message.ClickedImport());
    expect(imported.model.searchResult).toBeNull();
    expect(imported.commands?.map((command) => command.name)).toEqual([
      "Config.Interrupt",
      "Resolve.Interrupt",
      "Search.Interrupt",
    ]);
    const obsolete = update(
      imported.model,
      Message.ReceivedSearch({
        ...token(running.model),
        result,
      }),
    );
    expect(obsolete.model).toBe(imported.model);
    const wrong = update(imported.model, Message.SearchCancelled(token(imported.model)));
    expect(wrong.commands ?? []).toHaveLength(0);
    const started = update(imported.model, Message.ResolveCancelled(token(imported.model)));
    expect(commandNamed(started.commands, "Resolve")?.args?.body).toMatchObject({
      participants: [{ id: "imported@example.test", required: false }],
      durationMinutes: 45,
    });
  });

  it("ignores startup configuration after an edit and after configuration has settled", () => {
    const config = Message.Configured({
      revision: 0,
      operation: 0,
      mode: "demo",
      config: { durationMinutes: 45 },
    });
    const edited = update(initial, Message.ChangedRule({ field: "duration", value: "90" }));
    expect(update(edited.model, config).model).toBe(edited.model);
    const configured = update(initial, config);
    expect(configured.model.duration).toBe(45);
    expect(isLoading(configured.model)).toBe(false);
    expect(update(configured.model, config).model).toBe(configured.model);
  });

  it("keeps a search running when copying a prior proposal fails", () => {
    const running = startSearch({ ...initial, searchResult: result });
    const copying = update(running.model, Message.ClickedCopy({ index: 0 }));
    expect(commandNamed(copying.commands, "CopyProposal")).toBeDefined();
    const failed = update(
      copying.model,
      Message.CopyFailed({
        ...token(copying.model),
        error: "Clipboard unavailable",
      }),
    );
    expect(failed.model.error).toBe("Clipboard unavailable");
    expect(failed.model.request).toEqual(running.model.request);
    expect(isLoading(failed.model)).toBe(true);
    const completed = update(
      failed.model,
      Message.ReceivedSearch({
        ...token(running.model),
        result: { ...result, evaluatedCount: 12 },
      }),
    );
    expect(completed.model.searchResult?.evaluatedCount).toBe(12);
    expect(isLoading(completed.model)).toBe(false);
    expect(completed.model.error).toBeNull();
    const edited = update(running.model, Message.ChangedMode());
    expect(
      update(
        edited.model,
        Message.CopyFailed({
          ...token(running.model),
          error: "obsolete clipboard failure",
        }),
      ).model.error,
    ).toBeNull();
  });

  it("derives loading for config, replacement, execution, completion and edits", () => {
    expect(isLoading(initial)).toBe(true);
    const clicked = update(initial, Message.ClickedSearch());
    expect(isLoading(clicked.model)).toBe(true);
    const started = update(clicked.model, Message.SearchCancelled(token(clicked.model)));
    expect(isLoading(started.model)).toBe(true);
    const failed = update(
      started.model,
      Message.Failed({
        ...token(started.model),
        error: "Search unavailable",
      }),
    );
    expect(isLoading(failed.model)).toBe(false);
    expect(failed.model.error).toBe("Search unavailable");
    const edited = update(clicked.model, Message.ChangedMode());
    expect(isLoading(edited.model)).toBe(false);
  });
});

describe("web attendance policies", () => {
  it("edits per-person rules, invalidates results, and preserves policies in search and download", () => {
    const model = {
      ...initial,
      people: [person("one@example.test"), person("two@example.test")],
      searchResult: {
        audience,
        timeZone: "UTC",
        searchedAt: "2030-01-07T00:00:00Z",
        candidates: [candidate],
        blockedAlternatives: [],
        evaluatedCount: 1,
        validCount: 1,
        calendarsWithErrors: [],
      },
    };
    const selected = update(
      model,
      Message.ChangedAttendance({ index: 0, field: "type", value: "percentage" }),
    );
    const edited = update(
      selected.model,
      Message.ChangedAttendance({ index: 0, field: "amount", value: "75" }),
    );
    expect(edited.model.people.map((p) => p.attendanceRule)).toEqual([
      { type: "percentage", percent: 75 },
      { type: "full" },
    ]);
    expect(edited.model.searchResult).toBeNull();
    expect(edited.model.revision).toBeGreaterThan(model.revision);
    const search = update(edited.model, Message.ClickedSearch());
    const started = update(
      search.model,
      Message.SearchCancelled({
        revision: search.model.revision,
        operation: search.model.operation,
      }),
    );
    const body = commandNamed(started.commands, "Search")?.args?.body as {
      participants: ResolvedParticipant[];
    };
    expect(body.participants[0]?.attendanceRule).toEqual({ type: "percentage", percent: 75 });
    const download = update(edited.model, Message.ClickedDownload());
    const snapshot = JSON.parse(download.commands?.[0]?.args?.text as string);
    expect(snapshot.participants[0].attendanceRule).toEqual({ type: "percentage", percent: 75 });
    const imported = update(
      { ...initial, snapshotDraft: JSON.stringify(snapshot) },
      Message.ClickedImport(),
    );
    expect(imported.model.error).toBeNull();
    expect(
      commandNamed(
        update(
          imported.model,
          Message.ResolveCancelled({
            revision: imported.model.revision,
            operation: imported.model.operation,
          }),
        ).commands,
        "Resolve",
      )?.args?.body,
    ).toMatchObject({
      participants: [{ attendanceRule: { type: "percentage", percent: 75 } }, {}],
    });
    const stale = update(
      edited.model,
      Message.Failed({
        error: "old response",
        revision: model.revision,
        operation: model.operation,
      }),
    );
    expect(stale.model.error).toBeNull();
  });

  it("copies a partial attendee's rule and actual free portion without describing full attendance", () => {
    const partial = {
      ...candidate,
      participants: [
        {
          ...candidate.participants[0]!,
          state: "busy" as const,
          attendanceRule: { type: "start" as const, minutes: 20 },
          availableIntervals: [{ start: "2030-01-07T09:00:00Z", end: "2030-01-07T09:20:00Z" }],
          longestAvailableMinutes: 20,
          longestAvailablePercentage: 100 / 3,
        },
      ],
    };
    const copied = update(
      {
        ...initial,
        timeZone: "UTC",
        searchResult: {
          audience,
          timeZone: "UTC",
          searchedAt: "2030-01-07T00:00:00Z",
          candidates: [partial],
          blockedAlternatives: [],
          evaluatedCount: 1,
          validCount: 1,
          calendarsWithErrors: [],
        },
      },
      Message.ClickedCopy({ index: 0 }),
    );
    const text = copied.commands?.[0]?.args?.text as string;
    expect(text).toContain("First 20 minutes: met");
    expect(text).toContain("9:20");
    expect(text).not.toContain("Free for whole meeting");
  });
});
