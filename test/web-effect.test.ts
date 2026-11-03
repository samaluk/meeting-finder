import { Effect, Fiber, Schema } from "effect";
import { it } from "@effect/vitest";
import { expect, it as vitestIt } from "vitest";
import {
  Config,
  CopyProposal,
  Message,
  ModelSchema,
  Resolve,
  formatHttpError,
  initial,
  update,
} from "../web/app.js";

it.effect("aborts a pending typed config request when its Effect is interrupted", () =>
  Effect.gen(function* () {
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: { origin: "http://meeting-finder.test" },
    });
    let started = false;
    let notifyStarted!: () => void;
    const startedPromise = new Promise<void>((resolve) => {
      notifyStarted = resolve;
    });
    let aborted = false;
    const previousFetch = globalThis.fetch;
    globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
      started = true;
      notifyStarted();
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          aborted = true;
          reject(new DOMException("The request was aborted", "AbortError"));
        });
      });
    }) as typeof fetch;
    try {
      const fiber = yield* Effect.forkChild(Config({ revision: 0, operation: 0 }).effect);
      yield* Effect.promise(() => startedPromise);
      expect(started).toBe(true);
      yield* Fiber.interrupt(fiber);
      expect(aborted).toBe(true);
    } finally {
      globalThis.fetch = previousFetch;
    }
  }),
);

it.effect("reports schema paths before sending an invalid resolve draft", () =>
  Effect.gen(function* () {
    const result = yield* Resolve({
      mode: "demo",
      body: {
        participants: [
          { id: "person@example.test", attendanceRule: { type: "percentage", percent: 0 } },
        ],
      },
      revision: 1,
      operation: 1,
    }).effect;
    expect(result._tag).toBe("Failed");
    if (result._tag === "Failed")
      expect(result.error).toContain("participants[0].attendanceRule.percent");
  }),
);

vitestIt("shows structured server issue paths with the problem detail", () => {
  const error = formatHttpError({
    detail: "The audience could not be resolved",
    issues: [
      {
        path: ["participants", 0, "attendanceRule", "percent"],
        message: "Must be between 1 and 100",
      },
    ],
  });
  expect(error).toContain("The audience could not be resolved");
  expect(error).toContain("participants[0].attendanceRule.percent");
});

vitestIt("starts the replacement search only after cancellation completes", () => {
  const clicked = update(
    { ...initial, startDate: "2030-01-01", endDate: "2030-01-02" },
    Message.ClickedSearch(),
  );
  expect(clicked.commands?.map((command) => command.name)).toContain("Search.Interrupt");

  const cancelled = update(
    clicked.model,
    Message.SearchCancelled({
      revision: clicked.model.revision,
      operation: clicked.model.operation,
    }),
  );
  const search = cancelled.commands?.find((command) => command.name === "Search");
  expect(search).toBeDefined();
  expect(search?.args?.operation).toBe(cancelled.model.operation);
});

vitestIt("ignores cancellation acknowledgements from an obsolete operation", () => {
  const first = update(
    { ...initial, startDate: "2030-01-01", endDate: "2030-01-02" },
    Message.ClickedSearch(),
  );
  const second = update(first.model, Message.ClickedSearch());
  const stale = update(
    second.model,
    Message.SearchCancelled({
      revision: first.model.revision,
      operation: first.model.operation,
    }),
  );
  expect(stale.commands?.some((command) => command.name === "Search") ?? false).toBe(false);
  const current = update(
    second.model,
    Message.SearchCancelled({
      revision: second.model.revision,
      operation: second.model.operation,
    }),
  );
  expect(current.commands?.some((command) => command.name === "Search")).toBe(true);
});

vitestIt("drops a pending replacement when the model is edited", () => {
  const clicked = update(
    { ...initial, startDate: "2030-01-01", endDate: "2030-01-02" },
    Message.ClickedSearch(),
  );
  const edited = update(clicked.model, Message.ChangedRule({ field: "duration", value: "90" }));
  const stale = update(
    edited.model,
    Message.SearchCancelled({
      revision: clicked.model.revision,
      operation: clicked.model.operation,
    }),
  );
  expect(stale.commands?.some((command) => command.name === "Search") ?? false).toBe(false);
});

it.effect(
  "reports invalid editable drafts through the search command without rejecting browser state",
  () =>
    Effect.gen(function* () {
      const edited = update(
        initial,
        Message.ChangedRule({ field: "startDate", value: "invalid-date" }),
      );
      const clicked = update(edited.model, Message.ClickedSearch());
      expect(Schema.is(ModelSchema)(clicked.model)).toBe(true);
      const started = update(
        clicked.model,
        Message.SearchCancelled({
          revision: clicked.model.revision,
          operation: clicked.model.operation,
        }),
      );
      const command = started.commands!.find((command) => command.name === "Search")!;
      const result = yield* command.effect;
      expect(result._tag).toBe("Failed");
      if (result._tag === "Failed") {
        expect(result.error).toContain("startDate");
        const settled = update(started.model, result);
        expect(settled.model.error).toContain("startDate");
        expect(settled.model.request._tag).toBe("Idle");
      }
    }),
);

it.effect("classifies a clipboard failure independently from request failures", () =>
  Effect.gen(function* () {
    const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { clipboard: { writeText: () => Promise.reject(new Error("Clipboard unavailable")) } },
    });
    try {
      const result = yield* CopyProposal({ text: "Proposal", revision: 3, operation: 4 }).effect;
      expect(result._tag).toBe("CopyFailed");
      if (result._tag === "CopyFailed") expect(result).toMatchObject({ revision: 3, operation: 4 });
    } finally {
      if (previousNavigator) Object.defineProperty(globalThis, "navigator", previousNavigator);
      else Reflect.deleteProperty(globalThis, "navigator");
    }
  }),
);
