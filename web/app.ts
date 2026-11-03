import { Schema } from "effect";
import { defaultWorkingHours } from "../src/domain/participant.js";
import type { Runtime, Update } from "foldkit";
import { RequestInputSchema } from "../src/domain/request.js";
import { issuesFromSchemaError } from "../src/errors.js";
import { Config, CopyProposal, ExportSnapshot } from "./commands.js";
import { formatProposal } from "./presentation.js";
import { meetingFieldsOf, resolveRequestOf, searchRequestOf } from "./requests.js";
import {
  configure,
  invalidate,
  isCurrent,
  proceed,
  replace,
  settle,
  tokenOf,
} from "./app/lifecycle.js";
import { exampleAudience } from "../src/defaults.js";
import { initial, Message, type Model, type RuleField, type Source } from "./model.js";
export { initial, isLoading, Message, ModelSchema } from "./model.js";
export type { Candidate, Model, Person, RuleField } from "./model.js";
export { Config, CopyProposal, ExportSnapshot, Resolve, Search } from "./commands.js";
export { formatHttpError } from "./commands.js";
const sourceTypeOf = (value: string): Source["type"] => {
  switch (value) {
    case "person":
    case "emails":
    case "chat_space":
    case "google_group":
    case "contact_group":
      return value;
    default:
      return "person";
  }
};
export const init: Runtime.ApplicationInit<Model, Message> = () => ({
  model: initial,
  commands: [Config(tokenOf(initial))],
});
const rulePatch = (field: RuleField, value: string): Partial<Model> => {
  switch (field) {
    case "duration":
      return { duration: Number(value) };
    case "buffer":
      return { buffer: Number(value) };
    case "minimum":
      return { minimum: Number(value) };
    case "step":
      return { step: Number(value) };
    case "maxResults":
      return { maxResults: Number(value) };
    case "startDate":
      return { startDate: value };
    case "endDate":
      return { endDate: value };
    case "timeZone":
      return { timeZone: value };
  }
};
export const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    ChangedRule: ({ field, value }) => invalidate(model, rulePatch(field, value)),
    ChangedMode: () => invalidate(model, { mode: model.mode === "demo" ? "live" : "demo" }),
    ClickedExample: () => {
      const draft = { mode: "demo" as const, ...exampleAudience };
      return replace(
        model,
        { kind: "resolve", body: resolveRequestOf({ ...model, ...draft }) },
        draft,
      );
    },
    ClickedDownload: () => ({
      model,
      commands: [
        ExportSnapshot({
          text: JSON.stringify(searchRequestOf(model), null, 2),
        }),
      ],
    }),
    ClickedCopy: ({ index }) => {
      const candidate = model.searchResult?.candidates[index];
      if (candidate === undefined) return { model };
      const text = formatProposal(candidate, {
        timeZone: model.timeZone,
        audienceSize: model.people.length,
        mode: model.mode,
      });
      return {
        model,
        commands: [CopyProposal({ text, revision: model.revision, operation: model.operation })],
      };
    },
    ClickedResolve: () => replace(model, { kind: "resolve", body: resolveRequestOf(model) }),
    Resolved: ({ people, ...token }) => settle(model, token, { kind: "resolve", people }),
    Failed: ({ error, ...token }) => settle(model, token, { kind: "failure", error }),
    CopyFailed: ({ error, ...token }) =>
      isCurrent(model, token) ? { model: { ...model, error } } : { model },
    Cancelled: () => ({ model }),
    ResolveCancelled: (token) => proceed(model, "resolve", token),
    SearchCancelled: (token) => proceed(model, "search", token),
    AddedSource: () =>
      invalidate(model, {
        sources: [
          ...model.sources,
          {
            type: model.sourceType,
            ref: model.sourceDraft,
            required: model.sourceRequired,
            weight: model.sourceWeight,
          },
        ],
        sourceDraft: "",
      }),
    ChangedSourceDraft: ({ value }) => ({ model: { ...model, sourceDraft: value } }),
    ChangedSourceType: ({ value }) => ({ model: { ...model, sourceType: sourceTypeOf(value) } }),
    ChangedSourceRequired: ({ value }) => ({ model: { ...model, sourceRequired: value } }),
    ChangedSourceWeight: ({ value }) => ({ model: { ...model, sourceWeight: Number(value) } }),
    ChangedSnapshot: ({ value }) => ({ model: { ...model, snapshotDraft: value } }),
    ClickedImport: () => {
      try {
        const parsed: unknown = JSON.parse(model.snapshotDraft);
        const importValue =
          typeof parsed === "object" && parsed !== null
            ? Object.fromEntries(
                Object.entries(parsed).filter(
                  ([key, value]) =>
                    !(
                      (key === "startDate" || key === "endDate" || key === "timeZone") &&
                      value === ""
                    ),
                ),
              )
            : parsed;
        const config = Schema.decodeUnknownSync(RequestInputSchema)(importValue);
        if (
          config.participants === undefined ||
          config.participants.length === 0 ||
          (config.sources?.length ?? 0) > 0
        )
          return {
            model: {
              ...model,
              error: "Import a participant snapshot with participants and no sources.",
            },
          };
        return replace(
          model,
          { kind: "resolve", body: config },
          {
            ...meetingFieldsOf(model, config),
            sources: [],
            overrides: config.overrides ?? [],
            participantDefaults: config.participantDefaults,
            groupAliases: {},
            people: [],
          },
        );
      } catch (error) {
        if (Schema.isSchemaError(error)) {
          const details = issuesFromSchemaError(error)
            .map(({ path, message }) => `${path.join(".") || "snapshot"}: ${message}`)
            .join("; ");
          return { model: { ...model, error: `Invalid participant snapshot: ${details}` } };
        }
        return { model: { ...model, error: "Import must be valid JSON containing participants." } };
      }
    },
    RemovedSource: ({ index }) =>
      invalidate(model, { sources: model.sources.filter((_, i) => i !== index) }),
    AddedPerson: () =>
      invalidate(model, {
        people: [
          ...model.people,
          {
            id: "person@example.test",
            required: true,
            weight: 1,
            attendanceRule: { type: "full" },
            timeZone: model.timeZone,
            workingHours: defaultWorkingHours,
            calendarIds: ["person@example.test"],
            memberships: [],
          },
        ],
      }),
    RemovedPerson: ({ index }) =>
      invalidate(model, { people: model.people.filter((_, i) => i !== index) }),
    ChangedAttendance: ({ index, field, value }) =>
      invalidate(model, {
        people: model.people.map((person, i) => {
          if (i !== index) return person;
          const previous = person.attendanceRule;
          let attendanceRule = previous;
          if (field === "type") {
            switch (value) {
              case "full":
                attendanceRule = { type: "full" };
                break;
              case "start":
              case "end":
                attendanceRule = { type: value, minutes: Math.min(15, model.duration) };
                break;
              case "percentage":
                attendanceRule = { type: "percentage", percent: 50 };
                break;
            }
          } else if (previous.type === "percentage") {
            attendanceRule = { ...previous, percent: Number(value) };
          } else if (previous.type === "start" || previous.type === "end") {
            attendanceRule = { ...previous, minutes: Number(value) };
          }
          return { ...person, attendanceRule };
        }),
      }),
    ChangedPerson: ({ index, field, value }) =>
      invalidate(model, {
        people: model.people.map((person, i) =>
          i === index
            ? {
                ...person,
                ...(field === "id" &&
                person.calendarIds.length === 1 &&
                person.calendarIds[0] === person.id
                  ? { calendarIds: [value] }
                  : {}),
                [field]:
                  field === "weight"
                    ? Number(value)
                    : field === "required"
                      ? value === "true"
                      : value,
              }
            : person,
        ),
      }),
    ChangedDetails: ({ index, field, value }) =>
      invalidate(model, {
        people: model.people.map((person, i) => {
          if (i !== index) return person;
          if (field === "calendarIds")
            return {
              ...person,
              calendarIds: value
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean),
            };
          const [group, key] = field.split(":");
          if (
            group === "workingHours" &&
            (key === "breakStart" || key === "breakEnd") &&
            value === ""
          ) {
            const workingHours = { ...person.workingHours };
            delete workingHours[key];
            return { ...person, workingHours };
          }
          if (group === "workingHours" && key)
            return {
              ...person,
              workingHours: {
                ...(person.workingHours ?? { start: "09:00", end: "18:00", days: [1, 2, 3, 4, 5] }),
                [key]:
                  key === "days"
                    ? value
                        .split(",")
                        .map(Number)
                        .filter((day) => Number.isInteger(day))
                    : value,
              },
            };
          return { ...person, [field]: value };
        }),
      }),
    ChangedFilter: ({ value }) => ({ model: { ...model, filter: value } }),
    SetRequired: ({ required }) =>
      invalidate(model, { people: model.people.map((person) => ({ ...person, required })) }),
    ClickedSearch: () => replace(model, { kind: "search", body: searchRequestOf(model) }),
    ReceivedSearch: ({ result, ...token }) => settle(model, token, { kind: "search", result }),
    DownloadedSnapshot: () => ({ model }),
    CopiedProposal: () => ({ model }),
    Configured: ({ config, mode, ...token }) => configure(model, token, config, mode),
  });
