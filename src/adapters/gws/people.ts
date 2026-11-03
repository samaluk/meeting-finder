import { Effect } from "effect";
import type { DirectoryResult } from "../../providers.js";
import type { FinderError } from "../../errors.js";
import type { GwsProcess } from "../gws-process.js";
import { asText, command, invalid, object, pages, provider, runJson, text } from "./client.js";
export const personEmails = (
  p: GwsProcess,
  resources: ReadonlyArray<string>,
): Effect.Effect<ReadonlyArray<{ id: string; name?: string }>, FinderError> => {
  const ids = resources.filter(text);
  if (!ids.length) return Effect.succeed([]);
  const batches = Array.from({ length: Math.ceil(ids.length / 50) }, (_, i) =>
    ids
      .slice(i * 50, i * 50 + 50)
      .map((id) => (id.startsWith("users/") ? `people/${id.slice("users/".length)}` : id)),
  );
  return Effect.forEach(
    batches,
    (batch) =>
      runJson(
        p,
        command(["people", "people", "getBatchGet"], {
          personFields: "emailAddresses,names",
          resourceNames: batch,
        }),
      ),
    { concurrency: p.concurrency ?? 2 },
  ).pipe(
    Effect.flatMap((values) => {
      const out: Array<{ id: string; name?: string }> = [];
      const returned = new Set<string>();
      const expected = new Set(batches.flat());
      for (const [batchIndex, value] of values.entries()) {
        if (!object(value) || !Array.isArray(value.responses))
          return provider("gws People batch response is malformed");
        const batch = value.responses;
        const expectedBatch = batches[batchIndex] ?? [];
        if (batch.length !== expectedBatch.length)
          return provider("Google People batch response was incomplete");
        for (const response of batch) {
          if (!object(response) || !object(response.person))
            return provider("gws People response is malformed");
          const person = response.person;
          if (text(person.resourceName)) returned.add(person.resourceName);
          const addresses = Array.isArray(person.emailAddresses)
            ? person.emailAddresses
                .filter(object)
                .map((a) => ({
                  email: asText(a, "value"),
                  primary: object(a.metadata) && a.metadata.primary === true,
                }))
                .filter((a): a is { email: string; primary: boolean } => text(a.email))
            : [];
          const chosen =
            addresses.filter((a) => a.primary).length === 1
              ? addresses.find((a) => a.primary)?.email
              : addresses.length === 1
                ? addresses[0]?.email
                : undefined;
          if (!chosen) return provider("Google identity has no unambiguous email");
          const names = Array.isArray(person.names) ? person.names.filter(object) : [];
          const name =
            names.find((n) => object(n.metadata) && n.metadata.primary === true) ?? names[0];
          out.push({
            id: chosen.toLowerCase(),
            ...(name && text(name.displayName) ? { name: name.displayName } : {}),
          });
        }
      }
      if (returned.size !== expected.size || [...expected].some((id) => !returned.has(id)))
        return provider("Google People batch response was incomplete");
      return Effect.succeed(out);
    }),
  );
};
export const listContactGroups = (p: GwsProcess) =>
  pages(
    p,
    (token) =>
      command(["people", "contactGroups", "list"], {
        pageSize: 100,
        ...(token ? { pageToken: token } : {}),
      }),
    (v) => {
      if (!object(v) || !Array.isArray(v.contactGroups))
        throw invalid("gws contact groups response is malformed");
      return {
        members: v.contactGroups.flatMap((g) =>
          object(g) && text(g.resourceName)
            ? [{ id: g.resourceName, ...(text(g.name) ? { name: g.name } : {}) }]
            : [],
        ),
      };
    },
  );
export const contactGroupMembers = (
  p: GwsProcess,
  ref: string,
): Effect.Effect<DirectoryResult, FinderError> => {
  const groupName = ref.startsWith("contactGroups/")
    ? Effect.succeed(ref)
    : listContactGroups(p).pipe(
        Effect.flatMap((groups) => {
          const matches = groups.members.filter((g) => g.name === ref);
          const match = matches[0];
          return matches.length === 1 && match
            ? Effect.succeed(match.id)
            : provider(
                matches.length === 0
                  ? "Contacts label was not found"
                  : "Contacts label is ambiguous",
              );
        }),
      );
  return groupName.pipe(
    Effect.flatMap((resourceName) =>
      runJson(
        p,
        command(["people", "contactGroups", "get"], {
          resourceName,
          maxMembers: 100,
          groupFields: "name,memberResourceNames,memberCount",
        }),
      ),
    ),
    Effect.flatMap((v) =>
      !object(v) ||
      !Array.isArray(v.memberResourceNames) ||
      v.memberResourceNames.some((name) => !text(name)) ||
      (v.memberCount !== undefined &&
        (typeof v.memberCount !== "number" ||
          !Number.isInteger(v.memberCount) ||
          v.memberCount < 0 ||
          v.memberCount > 100 ||
          v.memberCount !== v.memberResourceNames.length))
        ? provider("Contacts group response is incomplete")
        : personEmails(p, v.memberResourceNames),
    ),
    Effect.map((members) => ({ members, omitted: [] })),
  );
};
