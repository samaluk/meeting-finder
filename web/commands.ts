import { Effect, Schema } from "effect";
import { FetchHttpClient } from "effect/http";
import { HttpApiClient } from "effect/http-api";
import { Command } from "foldkit";
import {
  MeetingFinderApi,
  HttpModeSchema as ModeSchema,
  type MeetingFinderApiClient,
} from "../src/api.js";
import { RequestInputSchema, SearchInputSchema } from "../src/domain/request.js";
import { issuesFromSchemaError } from "../src/errors.js";
import { Message } from "./model.js";

const httpClient = Effect.suspend(() =>
  HttpApiClient.make(MeetingFinderApi, {
    baseUrl: globalThis.location?.origin ?? "",
  }),
).pipe(Effect.provide(FetchHttpClient.layer));
export const formatHttpError = (error: unknown): string => {
  const issuePath = (path: ReadonlyArray<string | number>) =>
    path
      .map((part) => (typeof part === "number" ? `[${part}]` : String(part)))
      .join(".")
      .replaceAll(".[", "[");
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null;
  const isIssue = (
    value: unknown,
  ): value is { readonly path?: ReadonlyArray<string | number>; readonly message?: string } => {
    if (!isRecord(value)) return false;
    const path = value.path;
    return (
      (path === undefined ||
        (Array.isArray(path) &&
          path.every((part) => typeof part === "string" || typeof part === "number"))) &&
      (value.message === undefined || typeof value.message === "string")
    );
  };
  if (isRecord(error) && "detail" in error) {
    const detail = typeof error.detail === "string" ? error.detail : "Request failed";
    const issues = Array.isArray(error.issues) ? error.issues.filter(isIssue) : [];
    if (issues.length > 0)
      return `${detail}: ${issues
        .map(
          (entry) =>
            `${issuePath(entry.path ?? []) || "request"}: ${entry.message ?? "Invalid value"}`,
        )
        .join("; ")}`;
    return detail;
  }
  if (Schema.isSchemaError(error)) {
    const issues = issuesFromSchemaError(error);
    return `Invalid request: ${issues
      .map((entry) => `${issuePath(entry.path) || "request"}: ${entry.message}`)
      .join("; ")}`;
  }
  if (error instanceof Error) return error.message;
  return String(error);
};
const clientRequest = <A>(
  operation: (client: MeetingFinderApiClient) => Effect.Effect<A, never, never>,
) => Effect.flatMap(httpClient, operation);
export const Resolve = Command.define("Resolve", {
  args: {
    mode: ModeSchema,
    body: Schema.Unknown,
    revision: Schema.Finite,
    operation: Schema.Finite,
  },
  messages: [Message.Resolved, Message.Failed],
  interrupt: true,
  execute: ({ mode, body, revision, operation }) =>
    clientRequest((client) =>
      Schema.decodeUnknownEffect(RequestInputSchema)(body).pipe(
        Effect.flatMap((request) => client.meeting.resolve({ payload: { mode, request } })),
        Effect.map(({ participants }) =>
          Message.Resolved({ people: participants, revision, operation }),
        ),
        Effect.match({
          onFailure: (error) =>
            Message.Failed({ error: formatHttpError(error), revision, operation }),
          onSuccess: (message) => message,
        }),
      ),
    ),
});
export const Search = Command.define("Search", {
  args: {
    mode: ModeSchema,
    body: Schema.Unknown,
    revision: Schema.Finite,
    operation: Schema.Finite,
  },
  messages: [Message.ReceivedSearch, Message.Failed],
  interrupt: true,
  execute: ({ mode, body, revision, operation }) =>
    clientRequest((client) =>
      Schema.decodeUnknownEffect(SearchInputSchema)(body).pipe(
        Effect.flatMap((request) => client.meeting.search({ payload: { mode, request } })),
        Effect.map((result) => Message.ReceivedSearch({ result, revision, operation })),
        Effect.match({
          onFailure: (error) =>
            Message.Failed({ error: formatHttpError(error), revision, operation }),
          onSuccess: (message) => message,
        }),
      ),
    ),
});
export const Config = Command.define("Config", {
  args: { revision: Schema.Finite, operation: Schema.Finite },
  messages: [Message.Configured, Message.Failed],
  interrupt: true,
  execute: ({ revision, operation }) =>
    clientRequest((client) =>
      client.meeting.config({ query: {} }).pipe(
        Effect.match({
          onSuccess: ({ request: config, mode }) =>
            Message.Configured({ config, mode, revision, operation }),
          onFailure: (error) =>
            Message.Failed({ error: formatHttpError(error), revision, operation }),
        }),
      ),
    ),
});
export const CopyProposal = Command.define("CopyProposal", {
  args: { text: Schema.String, revision: Schema.Finite, operation: Schema.Finite },
  messages: [Message.CopiedProposal, Message.CopyFailed],
  execute: ({ text, revision, operation }) =>
    Effect.tryPromise(() => navigator.clipboard.writeText(text)).pipe(
      Effect.map(() => Message.CopiedProposal({ candidate: text })),
      Effect.catch((error) =>
        Effect.succeed(Message.CopyFailed({ error: String(error), revision, operation })),
      ),
    ),
});
export const ExportSnapshot = Command.define("ExportSnapshot", {
  args: { text: Schema.String },
  messages: [Message.DownloadedSnapshot],
  execute: ({ text }) =>
    Effect.sync(() => {
      const blob = new Blob([text], { type: "application/json" });
      const anchor = document.createElement("a");
      anchor.href = URL.createObjectURL(blob);
      anchor.download = "meeting-finder-participants.json";
      anchor.click();
      URL.revokeObjectURL(anchor.href);
    }).pipe(Effect.as(Message.DownloadedSnapshot())),
});
