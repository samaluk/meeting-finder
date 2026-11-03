import { Effect } from "effect";
import type { ExternalSource } from "../../domain/directory.js";
import type { FinderError } from "../../errors.js";
import type { Directory, DirectoryResult } from "../../providers.js";
import type { GwsProcess } from "../gws-process.js";
import { command, error, invalid, object, pages, provider, runJson, text } from "./client.js";
import { contactGroupMembers, listContactGroups, personEmails } from "./people.js";
const groupMembers = (p: GwsProcess, group: string) =>
  runJson(
    p,
    command(
      ["calendar", "freebusy", "query"],
      {},
      {
        timeMin: "1970-01-01T00:00:00Z",
        timeMax: "1970-01-02T00:00:00Z",
        groupExpansionMax: 100,
        calendarExpansionMax: 50,
        items: [{ id: group }],
      },
    ),
  ).pipe(
    Effect.flatMap((v) => {
      if (!object(v) || !object(v.groups))
        return provider("Google Group freebusy response has no groups");
      const value = v.groups[group];
      if (value === undefined) return provider(`Google Group freebusy response omitted ${group}`);
      if (!object(value) || !Array.isArray(value.calendars))
        return provider("Google Group freebusy response has no calendars");
      if (value.errors !== undefined && !Array.isArray(value.errors))
        return provider(`Google Group ${group} expansion errors are malformed`);
      if (Array.isArray(value.errors) && value.errors.length > 0)
        return provider(`Google Group ${group} expansion failed`);
      if (!value.calendars.every(text))
        return provider(`Google Group ${group} expansion has malformed calendars`);
      return Effect.succeed(value.calendars.map((id) => ({ id: id.toLowerCase() })));
    }),
  );
const normalizeSpace = (ref: string) => {
  const match = ref.match(/(?:\/room\/|\/space\/)([^/?#]+)/);
  return `spaces/${match?.[1] ?? ref.replace(/^spaces\//, "")}`;
};
export const makeGwsDirectory = (p: GwsProcess): Directory["Service"] => ({
  list: (kind) => {
    if (kind !== "chat_space" && kind !== "contact_group")
      return Effect.fail(invalid("Unsupported directory source kind"));
    return kind === "chat_space"
      ? pages(
          p,
          (token) =>
            command(["chat", "spaces", "list"], {
              pageSize: 100,
              ...(token ? { pageToken: token } : {}),
            }),
          (v) => {
            if (!object(v) || !Array.isArray(v.spaces))
              throw invalid("gws Chat spaces response is malformed");
            return {
              members: v.spaces.flatMap((s) =>
                object(s) && text(s.name)
                  ? [{ id: s.name, ...(text(s.displayName) ? { name: s.displayName } : {}) }]
                  : [],
              ),
            };
          },
        ).pipe(Effect.map((spaces) => spaces.members.map((s) => ({ ...s, kind }))))
      : listContactGroups(p).pipe(
          Effect.map((groups) => groups.members.map((group) => ({ ...group, kind }))),
        );
  },
  primary: runJson(p, command(["calendar", "calendars", "get"], { calendarId: "primary" })).pipe(
    Effect.flatMap((v) =>
      object(v) && text(v.id)
        ? Effect.succeed(v.id.toLowerCase())
        : provider("Primary calendar response had no id"),
    ),
  ),
  expand: (
    source: ExternalSource,
    aliases: Readonly<Record<string, string>>,
  ): Effect.Effect<DirectoryResult, FinderError> => {
    switch (source.type) {
      case "google_group":
        return groupMembers(p, source.ref).pipe(
          Effect.map((members) => ({ members, omitted: [] })),
        );
      case "chat_space": {
        const space = normalizeSpace(source.ref);
        return pages(
          p,
          (token) =>
            command(["chat", "spaces", "members", "list"], {
              parent: space,
              pageSize: 100,
              ...(token ? { pageToken: token } : {}),
            }),
          (v) => {
            if (!object(v) || !Array.isArray(v.memberships))
              throw invalid("gws Chat memberships response is malformed");
            const resources: string[] = [];
            const omitted: Array<{ id?: string; reason: string }> = [];
            for (const membership of v.memberships) {
              if (!object(membership)) throw invalid("gws Chat membership is malformed");
              const member = object(membership.member) ? membership.member : undefined;
              const groupMember = object(membership.groupMember)
                ? membership.groupMember
                : undefined;
              const memberName =
                member && text(member.name)
                  ? member.name
                  : groupMember && text(groupMember.name)
                    ? groupMember.name
                    : undefined;
              const state = String(membership.state ?? "").toUpperCase(),
                type = String(member?.type ?? (groupMember ? "GROUP" : "")).toUpperCase();
              const group =
                object(membership.groupMember) && text(membership.groupMember.name)
                  ? membership.groupMember.name
                  : undefined;
              if (type === "BOT") {
                omitted.push({ ...(memberName ? { id: memberName } : {}), reason: "bot" });
                continue;
              }
              if (state !== "JOINED") {
                omitted.push({
                  ...(memberName ? { id: memberName } : {}),
                  reason: "pending invitation",
                });
                continue;
              }
              if (type === "GROUP") {
                if (!group || !aliases[group])
                  throw error(
                    `Chat group in ${space} has no groupAliases relationship`,
                    "Declare the Chat group alias",
                  );
              }
              if (type === "GROUP" && group) {
                resources.push(`group:${aliases[group]}`);
                continue;
              }
              if (!member || !text(member.name))
                throw invalid("Chat human member has no resource name");
              resources.push(
                member.name.includes("@")
                  ? `email:${member.name.replace(/^users\//, "")}`
                  : member.name,
              );
            }
            return { members: resources.map((id) => ({ id })), omitted };
          },
        ).pipe(
          Effect.flatMap((resources) => {
            const direct = resources.members
              .filter((x) => x.id.startsWith("email:"))
              .map((x) => ({ id: x.id.slice("email:".length).toLowerCase() }));
            const people = resources.members
              .map((x) => x.id)
              .filter((id) => !id.startsWith("group:") && !id.startsWith("email:"));
            const omitted = resources.omitted;
            const groups = resources.members
              .map((x) => x.id)
              .filter((id) => id.startsWith("group:"))
              .map((id) => id.slice("group:".length))
              .filter((id) => id.length > 0);
            return Effect.forEach(groups, (group) => groupMembers(p, group), {
              concurrency: p.concurrency ?? 2,
            }).pipe(
              Effect.flatMap((groupResults) => {
                return personEmails(p, people).pipe(
                  Effect.map((peopleResult) => ({
                    members: [...direct, ...peopleResult, ...groupResults.flat()],
                    omitted,
                  })),
                );
              }),
            );
          }),
        );
      }
      case "contact_group":
        return contactGroupMembers(p, source.ref);
    }
  },
});
