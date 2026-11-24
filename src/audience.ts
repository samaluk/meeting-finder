import { Effect } from "effect";
import type { RequestInput, SourceInput } from "./domain/request.js";
import type { ResolvedAudience, SourceResolution } from "./domain/audience.js";
import {
  defaultTimeZone,
  defaultWorkingHours,
  type OverrideInput,
  type ParticipantInput,
  type ResolvedParticipant,
} from "./domain/participant.js";
import type { DirectoryMember, DirectoryResult } from "./domain/directory.js";
import { inputError, type FinderError } from "./errors.js";
import { Directory } from "./providers.js";

const normalizeId = (id: string) => id.trim().toLowerCase();
const isPrimary = (id: string) => normalizeId(id) === "primary";
type PrimaryLookup = Effect.Effect<string, FinderError>;

const canonicalId = (normalized: string, primary?: string) =>
  normalized === "primary" && primary ? primary : normalized;

const resolveParticipantId = (input: string, primary: PrimaryLookup) => {
  const id = normalizeId(input);
  return id === "primary"
    ? Effect.map(primary, (primaryId) => canonicalId(id, primaryId))
    : Effect.succeed(id);
};

// Calendar email identities are case-insensitive; provider resource names are opaque.
const normalizeCalendarId = (id: string, primary?: string) => {
  const trimmed = id.trim();
  if (trimmed.toLowerCase() === "primary" && primary !== undefined) return primary;
  return trimmed.includes("@") ? trimmed.toLowerCase() : trimmed;
};

const normalizeCalendarIds = (ids: ReadonlyArray<string>, primary?: string) => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const input of ids) {
    const id = normalizeCalendarId(input, primary);
    const key = id.includes("@") ? id.toLowerCase() : id;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(id);
    }
  }
  return result;
};

const normalizeGroupAliases = (aliases: RequestInput["groupAliases"]) =>
  aliases === undefined
    ? undefined
    : Object.fromEntries(Object.entries(aliases).map(([key, value]) => [key.trim(), value.trim()]));

const validateGroupAliases = (
  aliases: RequestInput["groupAliases"],
): Effect.Effect<void, FinderError> => {
  if (aliases === undefined) return Effect.void;
  const seen = new Set<string>();
  for (const key of Object.keys(aliases)) {
    const normalized = key.trim();
    if (seen.has(normalized))
      return Effect.fail(
        inputError(
          `Duplicate group alias key after trimming: ${normalized}`,
          "Use one canonical Chat group resource name",
          [
            {
              path: ["groupAliases", key],
              message: "Alias key duplicates another key after trimming",
            },
          ],
        ),
      );
    seen.add(normalized);
  }
  return Effect.void;
};

const acquireSource = (
  source: SourceInput,
  directory: Directory["Service"],
  aliases: Readonly<Record<string, string>>,
): Effect.Effect<DirectoryResult, FinderError> => {
  switch (source.type) {
    case "person":
      return Effect.succeed({ members: [{ id: source.ref }], omitted: [] });
    case "emails":
      return Effect.succeed({
        members: source.ref
          .split(/[;,\s]+/u)
          .filter(Boolean)
          .map((id) => ({ id })),
        omitted: [],
      });
    case "chat_space":
    case "google_group":
    case "contact_group":
      return directory.expand({ type: source.type, ref: source.ref }, aliases);
  }
};

const sourceResolution = (
  source: SourceInput,
  { members, omitted }: DirectoryResult,
  primary?: string,
): SourceResolution => ({
  source,
  members: members.map((member) => ({
    id: canonicalId(normalizeId(member.id), primary),
    ...(member.name === undefined ? {} : { name: member.name }),
  })),
  omitted: omitted.map((entry) => ({
    ...(entry.id === undefined ? {} : { id: entry.id }),
    reason: entry.reason,
  })),
});

const resolveSource = (
  source: SourceInput,
  directory: Directory["Service"],
  aliases: Readonly<Record<string, string>>,
  primary: PrimaryLookup,
) =>
  Effect.gen(function* () {
    const expanded = yield* acquireSource(source, directory, aliases);
    if (expanded.members.length === 0) {
      return yield* inputError(
        `Source produced no members: ${source.ref}`,
        "Choose a non-empty accessible source",
      );
    }
    const primaryId = expanded.members.some((member) => isPrimary(member.id))
      ? yield* primary
      : undefined;
    return sourceResolution(source, expanded, primaryId);
  });

const makeParticipant = (
  member: DirectoryMember,
  required: boolean,
  weight: number,
  defaults: RequestInput["participantDefaults"],
  memberships: ReadonlyArray<string>,
): ResolvedParticipant => ({
  id: member.id,
  ...(member.name === undefined ? {} : { name: member.name }),
  required,
  weight,
  timeZone: defaults?.timeZone ?? defaultTimeZone,
  workingHours: defaults?.workingHours ?? defaultWorkingHours,
  calendarIds: [member.id],
  attendanceRule: defaults?.attendanceRule ?? { type: "full" },
  memberships: [...memberships],
});

const mergeSource = (
  participants: Map<string, ResolvedParticipant>,
  { source, members }: SourceResolution,
  defaults: RequestInput["participantDefaults"],
) => {
  const required = source.required ?? true;
  const weight = source.weight ?? 1;
  for (const member of members) {
    const current = participants.get(member.id);
    const next =
      current === undefined
        ? makeParticipant(member, required, weight, defaults, [source.ref])
        : {
            ...current,
            ...(member.name === undefined ? {} : { name: member.name }),
            required,
            weight,
            memberships: [...current.memberships, source.ref],
          };
    participants.set(member.id, next);
  }
};

const applyParticipantPolicy = (
  participant: ResolvedParticipant,
  {
    required,
    weight,
    attendanceRule,
  }: Pick<OverrideInput, "required" | "weight" | "attendanceRule">,
): ResolvedParticipant => ({
  ...participant,
  required: required ?? participant.required,
  weight: weight ?? participant.weight,
  attendanceRule: attendanceRule ?? participant.attendanceRule,
});

const applyExplicitParticipant = (
  base: ResolvedParticipant,
  explicit: ParticipantInput,
  calendarPrimary: string | undefined,
): ResolvedParticipant => ({
  ...applyParticipantPolicy(base, explicit),
  ...(explicit.name === undefined ? {} : { name: explicit.name }),
  timeZone: explicit.timeZone ?? base.timeZone,
  workingHours: explicit.workingHours ?? base.workingHours,
  calendarIds:
    explicit.calendarIds === undefined
      ? base.calendarIds
      : normalizeCalendarIds(explicit.calendarIds, calendarPrimary),
});

export const resolveAudience = <R extends RequestInput>(
  input: R,
): Effect.Effect<ResolvedAudience & { readonly request: R }, FinderError, Directory> =>
  Effect.gen(function* () {
    yield* validateGroupAliases(input.groupAliases);
    const request = {
      ...input,
      ...(input.groupAliases === undefined
        ? {}
        : { groupAliases: normalizeGroupAliases(input.groupAliases) }),
    };
    const directory = yield* Directory;
    const primary = yield* Effect.cached(Effect.map(directory.primary, normalizeId));
    const aliases = request.groupAliases ?? {};
    const defaults = request.participantDefaults;
    const sourceResults: SourceResolution[] = [];
    const participants = new Map<string, ResolvedParticipant>();

    for (const source of request.sources ?? []) {
      const resolution = yield* resolveSource(source, directory, aliases, primary);
      sourceResults.push(resolution);
      mergeSource(participants, resolution, defaults);
    }

    const explicitSeen = new Set<string>();
    for (const explicit of request.participants ?? []) {
      const id = yield* resolveParticipantId(explicit.id, primary);
      if (explicitSeen.has(id)) {
        return yield* inputError(
          `Duplicate explicit participant: ${explicit.id}`,
          "Remove the duplicate participant",
        );
      }
      explicitSeen.add(id);
      const calendarPrimary = explicit.calendarIds?.some(isPrimary) ? yield* primary : undefined;
      const base = participants.get(id) ?? makeParticipant({ id }, true, 1, defaults, []);
      participants.set(id, applyExplicitParticipant(base, explicit, calendarPrimary));
    }

    const overrides = request.overrides ?? [];
    for (const override of overrides) {
      const id = yield* resolveParticipantId(override.id, primary);
      const current = participants.get(id);
      if (current === undefined) {
        return yield* inputError(
          `Override does not match audience: ${override.id}`,
          "Use an existing participant id",
        );
      }
      participants.set(id, applyParticipantPolicy(current, override));
    }

    const result = [...participants.values()];
    if (result.length === 0 || result.length > 100) {
      return yield* inputError(
        "Audience must contain between 1 and 100 people",
        "Adjust sources or participants",
      );
    }
    const requiredCount = result.filter((participant) => participant.required).length;
    return {
      request,
      participants: result,
      sources: sourceResults,
      total: result.length,
      requiredCount,
      optionalCount: result.length - requiredCount,
      overrides,
    };
  });
