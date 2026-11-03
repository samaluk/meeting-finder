import type { Update } from "foldkit";
import type { ResolvedParticipant } from "../../src/domain/participant.js";
import type { RequestInput } from "../../src/domain/request.js";
import type { SearchResult } from "../../src/domain/search.js";
import { Config, Resolve, Search } from "../commands.js";
import { Message, type Model, type Mode, type RequestKind, type RequestToken } from "../model.js";
import { meetingFieldsOf } from "../requests.js";

type Transition = Update.Return<Model, Message>;
type Replacement = { readonly kind: RequestKind; readonly body: unknown };
type Completion =
  | { readonly kind: "resolve"; readonly people: ReadonlyArray<ResolvedParticipant> }
  | { readonly kind: "search"; readonly result: SearchResult }
  | { readonly kind: "failure"; readonly error: string };

export const tokenOf = ({ revision, operation }: RequestToken): RequestToken => ({
  revision,
  operation,
});
export const isCurrent = (model: Model, token: RequestToken): boolean =>
  model.revision === token.revision && model.operation === token.operation;

const interrupts = (
  next?: RequestToken & { readonly kind: RequestKind },
): Update.Commands<Message> => [
  Config.Interrupt(() => Message.Cancelled()),
  Resolve.Interrupt(() =>
    next?.kind === "resolve" ? Message.ResolveCancelled(tokenOf(next)) : Message.Cancelled(),
  ),
  Search.Interrupt(() =>
    next?.kind === "search" ? Message.SearchCancelled(tokenOf(next)) : Message.Cancelled(),
  ),
];

export const invalidate = (model: Model, patch: Partial<Model>): Transition => ({
  model: {
    ...model,
    ...patch,
    request: { _tag: "Idle" },
    searchResult: null,
    error: null,
    revision: model.revision + 1,
    operation: model.operation + 1,
  },
  commands: interrupts(),
});

// A draft patch replaces editable configuration as well as the pending request.
export const replace = (model: Model, next: Replacement, draft?: Partial<Model>): Transition => {
  const nextModel: Model = {
    ...model,
    ...draft,
    revision: model.revision + (draft === undefined ? 0 : 1),
    operation: model.operation + 1,
    request: { _tag: "Replacing", ...next },
    error: null,
    searchResult: draft !== undefined || next.kind === "resolve" ? null : model.searchResult,
  };
  return {
    model: nextModel,
    commands: interrupts({ kind: next.kind, ...tokenOf(nextModel) }),
  };
};

const start = (model: Model, next: Replacement): Transition => ({
  model: { ...model, request: { _tag: "Running", kind: next.kind } },
  commands: [
    (next.kind === "resolve" ? Resolve : Search)({
      mode: model.mode,
      body: next.body,
      ...tokenOf(model),
    }),
  ],
});

export const proceed = (model: Model, kind: RequestKind, token: RequestToken): Transition => {
  if (!isCurrent(model, token) || model.request._tag !== "Replacing" || model.request.kind !== kind)
    return { model };
  // The acknowledgement sequences interruption before the replacement starts.
  return start(model, model.request);
};

export const settle = (model: Model, token: RequestToken, completion: Completion): Transition => {
  if (
    !isCurrent(model, token) ||
    model.request._tag !== "Running" ||
    (completion.kind !== "failure" && completion.kind !== model.request.kind)
  )
    return { model };
  const patch =
    completion.kind === "failure"
      ? { error: completion.error }
      : completion.kind === "resolve"
        ? { people: completion.people, error: null }
        : { searchResult: completion.result, error: null };
  return { model: { ...model, ...patch, request: { _tag: "Idle" } } };
};

export const configure = (
  model: Model,
  token: RequestToken,
  config: RequestInput,
  mode: Mode | undefined,
): Transition => {
  if (
    !isCurrent(model, token) ||
    model.request._tag !== "Running" ||
    model.request.kind !== "config"
  )
    return { model };
  const nextModel: Model = {
    ...model,
    ...meetingFieldsOf(model, config),
    mode: mode ?? model.mode,
    sources: config.sources ?? [],
    people: [],
    searchResult: null,
    overrides: config.overrides ?? [],
    participantDefaults: config.participantDefaults,
    groupAliases: config.groupAliases,
    operation: model.operation + 1,
    request: { _tag: "Idle" },
    error: null,
  };
  return (config.sources?.length ?? 0) > 0 || (config.participants?.length ?? 0) > 0
    ? start(nextModel, { kind: "resolve", body: config })
    : { model: nextModel };
};
