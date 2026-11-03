import { Effect } from "effect";
import { type RequestInput, type SourceInput } from "./domain/request.js";
import { type ResolvedAudience, type SourceResolution } from "./domain/audience.js";
import { type ResolvedParticipant } from "./domain/participant.js";
import type {
  DirectoryMember,
  DirectoryResult,
  ExternalSource,
  OmittedMember,
} from "./domain/directory.js";
import { inputError, type FinderError } from "./errors.js";
import { Directory } from "./providers.js";

import { defaultTimeZone, defaultWorkingHours } from "./domain/participant.js";

const normalizeId = (id: string) => id.trim().toLowerCase();

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

const sourceExpansion = (
  source: SourceInput,
):
  | { readonly kind: "local"; readonly members: ReadonlyArray<DirectoryMember> }
  | { readonly kind: "external"; readonly source: ExternalSource } => {
  switch (source.type) {
    case "person":
      return { kind: "local", members: [{ id: source.ref }] };
    case "emails":
      return {
        kind: "local",
        members: source.ref
          .split(/[;,\s]+/u)
          .filter(Boolean)
          .map((id) => ({ id })),
      };
    case "chat_space":
    case "google_group":
    case "contact_group":
      return { kind: "external", source: { type: source.type, ref: source.ref } };
  }
};

const normalizeMember = (member: DirectoryMember, primary?: string) => {
  const id = normalizeId(member.id) === "primary" && primary ? primary : normalizeId(member.id);
  return { id, ...(member.name === undefined ? {} : { name: member.name }) };
};

const sourcePolicy = (source: SourceInput) => ({
  required: source.required ?? true,
  weight: source.weight ?? 1,
});

const sourceResolution = (
  source: SourceInput,
  members: ReadonlyArray<DirectoryMember>,
  omitted: ReadonlyArray<OmittedMember> = [],
): SourceResolution => ({
  source,
  members: members.map((member) => ({
    id: member.id,
    ...(member.name === undefined ? {} : { name: member.name }),
  })),
  omitted: omitted.map((entry) => ({
    ...(entry.id === undefined ? {} : { id: entry.id }),
    reason: entry.reason,
  })),
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
    let primary: string | undefined;
    const ensurePrimary = () =>
      Effect.gen(function* () {
        if (primary === undefined) primary = normalizeId(yield* directory.primary);
        return primary;
      });
    const sources = request.sources ?? [];
    const sourceResults: SourceResolution[] = [];
    const participants = new Map<string, ResolvedParticipant>();

    for (const source of sources) {
      const expansion = sourceExpansion(source);
      const expanded: DirectoryResult =
        expansion.kind === "local"
          ? { members: expansion.members, omitted: [] }
          : yield* directory.expand(expansion.source, request.groupAliases ?? {});
      const rawMembers = expanded.members;
      if (rawMembers.some((member) => normalizeId(member.id) === "primary")) yield* ensurePrimary();
      const members = rawMembers.map((member) => normalizeMember(member, primary));
      const omitted = expanded.omitted;
      if (members.length === 0) {
        return yield* inputError(
          `Source produced no members: ${source.ref}`,
          "Choose a non-empty accessible source",
        );
      }
      sourceResults.push(sourceResolution(source, members, omitted));
      const policy = sourcePolicy(source);
      for (const member of members) {
        const key = normalizeId(member.id);
        const current = participants.get(key);
        if (current === undefined) {
          participants.set(
            key,
            makeParticipant(member, policy.required, policy.weight, request.participantDefaults, [
              source.ref,
            ]),
          );
        } else {
          participants.set(key, {
            ...current,
            ...(member.name === undefined ? {} : { name: member.name }),
            required: policy.required,
            weight: policy.weight,
            memberships: [...current.memberships, source.ref],
          });
        }
      }
    }

    const explicitSeen = new Set<string>();
    for (const inputParticipant of request.participants ?? []) {
      if (normalizeId(inputParticipant.id) === "primary") yield* ensurePrimary();
      const normalizedId =
        normalizeId(inputParticipant.id) === "primary" && primary
          ? primary
          : normalizeId(inputParticipant.id);
      const key = normalizeId(normalizedId);
      if (explicitSeen.has(key)) {
        return yield* inputError(
          `Duplicate explicit participant: ${inputParticipant.id}`,
          "Remove the duplicate participant",
        );
      }
      explicitSeen.add(key);
      const current = participants.get(key);
      const base =
        current ??
        makeParticipant(
          {
            id: normalizedId,
            ...(inputParticipant.name === undefined ? {} : { name: inputParticipant.name }),
          },
          true,
          1,
          request.participantDefaults,
          [],
        );
      const explicit = inputParticipant;
      if (explicit.calendarIds?.some((id) => normalizeId(id) === "primary")) yield* ensurePrimary();
      const calendarIds =
        explicit.calendarIds === undefined
          ? base.calendarIds
          : normalizeCalendarIds(explicit.calendarIds, primary);
      participants.set(key, {
        ...base,
        id: normalizedId,
        ...(explicit.name === undefined ? {} : { name: explicit.name }),
        ...(explicit.required === undefined ? {} : { required: explicit.required }),
        ...(explicit.attendanceRule === undefined
          ? {}
          : { attendanceRule: explicit.attendanceRule }),
        ...(explicit.weight === undefined ? {} : { weight: explicit.weight }),
        ...(explicit.timeZone === undefined ? {} : { timeZone: explicit.timeZone }),
        ...(explicit.workingHours === undefined ? {} : { workingHours: explicit.workingHours }),
        calendarIds,
      });
    }

    for (const override of request.overrides ?? []) {
      if (normalizeId(override.id) === "primary") yield* ensurePrimary();
      const key =
        normalizeId(override.id) === "primary" && primary ? primary : normalizeId(override.id);
      const current = participants.get(key);
      if (current === undefined) {
        return yield* inputError(
          `Override does not match audience: ${override.id}`,
          "Use an existing participant id",
        );
      }
      participants.set(key, {
        ...current,
        ...(override.required === undefined ? {} : { required: override.required }),
        ...(override.attendanceRule === undefined
          ? {}
          : { attendanceRule: override.attendanceRule }),
        ...(override.weight === undefined ? {} : { weight: override.weight }),
      });
    }

    const result = [...participants.values()];
    if (result.length === 0 || result.length > 100) {
      return yield* inputError(
        "Audience must contain between 1 and 100 people",
        "Adjust sources or participants",
      );
    }
    return {
      request,
      participants: result,
      sources: sourceResults,
      total: result.length,
      requiredCount: result.filter((participant) => participant.required).length,
      optionalCount: result.filter((participant) => !participant.required).length,
      overrides: request.overrides ?? [],
    };
  });
