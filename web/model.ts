import { Schema } from "effect";
import {
  ParticipantSchemaResolved,
  OverrideSchema,
  type ResolvedParticipant,
} from "../src/domain/participant.js";
import {
  RequestInputSchema,
  SourceSchema,
  SourceTypeSchema,
  type SourceInput,
} from "../src/domain/request.js";
import { SearchResultSchema, type MeetingCandidate } from "../src/domain/search.js";
import { ModeSchema } from "../src/mode.js";
import { defineMessageUnion } from "foldkit/message";

export type Person = ResolvedParticipant;
export type Source = SourceInput;
export type Candidate = MeetingCandidate;
const RequestKindSchema = Schema.Literals(["resolve", "search"]);
const RequestStateSchema = Schema.Union([
  Schema.TaggedStruct("Idle", {}),
  Schema.TaggedStruct("Replacing", {
    kind: RequestKindSchema,
    // Editable drafts may be invalid. Commands validate them at the boundary.
    body: Schema.Unknown,
  }),
  Schema.TaggedStruct("Running", {
    kind: Schema.Literals(["config", "resolve", "search"]),
  }),
]);
export type RequestKind = typeof RequestKindSchema.Type;
export interface RequestToken {
  readonly revision: number;
  readonly operation: number;
}
export const ModelSchema = Schema.Struct({
  mode: ModeSchema,
  startDate: Schema.String,
  endDate: Schema.String,
  timeZone: Schema.String,
  duration: Schema.Finite,
  buffer: Schema.Finite,
  minimum: Schema.Finite,
  step: Schema.Finite,
  maxResults: Schema.Finite,
  sources: Schema.Array(SourceSchema),
  overrides: Schema.Array(OverrideSchema),
  participantDefaults: RequestInputSchema.fields.participantDefaults,
  groupAliases: RequestInputSchema.fields.groupAliases,
  sourceDraft: Schema.String,
  sourceType: SourceTypeSchema,
  sourceRequired: Schema.Boolean,
  sourceWeight: Schema.Finite,
  snapshotDraft: Schema.String,
  people: Schema.Array(ParticipantSchemaResolved),
  filter: Schema.String,
  searchResult: Schema.NullOr(SearchResultSchema),
  request: RequestStateSchema,
  error: Schema.NullOr(Schema.String),
  revision: Schema.Finite,
  operation: Schema.Finite,
});
export type Model = typeof ModelSchema.Type;
export const isLoading = (model: Model): boolean => model.request._tag !== "Idle";
export type { Mode } from "../src/mode.js";
export const RuleFieldSchema = Schema.Literals([
  "startDate",
  "endDate",
  "timeZone",
  "duration",
  "buffer",
  "minimum",
  "step",
  "maxResults",
]);
export type RuleField = Schema.Schema.Type<typeof RuleFieldSchema>;
export const AttendanceFieldSchema = Schema.Literals(["type", "amount"]);
export type AttendanceField = Schema.Schema.Type<typeof AttendanceFieldSchema>;
export const PersonFieldSchema = Schema.Literals(["id", "weight", "required"]);
export type PersonField = Schema.Schema.Type<typeof PersonFieldSchema>;
export const DetailFieldSchema = Schema.Literals([
  "timeZone",
  "calendarIds",
  "workingHours:start",
  "workingHours:end",
  "workingHours:days",
  "workingHours:breakStart",
  "workingHours:breakEnd",
]);
export type DetailField = Schema.Schema.Type<typeof DetailFieldSchema>;
export const Message = defineMessageUnion({
  ChangedRule: {
    field: RuleFieldSchema,
    value: Schema.String,
  },
  ChangedMode: {},
  ClickedExample: {},
  ClickedDownload: {},
  ClickedCopy: { index: Schema.Finite },
  ClickedResolve: {},
  Resolved: {
    people: Schema.Array(ParticipantSchemaResolved),
    revision: Schema.Finite,
    operation: Schema.Finite,
  },
  Failed: { error: Schema.String, revision: Schema.Finite, operation: Schema.Finite },
  Cancelled: {},
  ResolveCancelled: { revision: Schema.Finite, operation: Schema.Finite },
  SearchCancelled: { revision: Schema.Finite, operation: Schema.Finite },
  Configured: {
    config: RequestInputSchema,
    mode: Schema.optional(ModeSchema),
    revision: Schema.Finite,
    operation: Schema.Finite,
  },
  AddedPerson: {},
  AddedSource: {},
  ChangedSourceDraft: { value: Schema.String },
  RemovedSource: { index: Schema.Finite },
  RemovedPerson: { index: Schema.Finite },
  ChangedAttendance: {
    index: Schema.Finite,
    field: AttendanceFieldSchema,
    value: Schema.String,
  },
  ChangedPerson: {
    index: Schema.Finite,
    field: PersonFieldSchema,
    value: Schema.String,
  },
  ChangedFilter: { value: Schema.String },
  SetRequired: { required: Schema.Boolean },
  ClickedSearch: {},
  ReceivedSearch: { result: SearchResultSchema, revision: Schema.Finite, operation: Schema.Finite },
  DownloadedSnapshot: {},
  ChangedSourceType: { value: Schema.String },
  ChangedSourceRequired: { value: Schema.Boolean },
  ChangedSourceWeight: { value: Schema.String },
  ChangedDetails: {
    index: Schema.Finite,
    field: DetailFieldSchema,
    value: Schema.String,
  },
  CopiedProposal: { candidate: Schema.String },
  CopyFailed: { error: Schema.String, revision: Schema.Finite, operation: Schema.Finite },
  ChangedSnapshot: { value: Schema.String },
  ClickedImport: {},
});
export type Message = typeof Message.Type;
export const initial: Model = {
  mode: "live",
  startDate: "",
  endDate: "",
  timeZone: "America/Santiago",
  duration: 60,
  buffer: 10,
  minimum: 1,
  step: 15,
  maxResults: 12,
  sources: [],
  overrides: [],
  sourceDraft: "",
  sourceType: "person",
  sourceRequired: true,
  sourceWeight: 1,
  snapshotDraft: "",
  people: [],
  filter: "",
  searchResult: null,
  request: { _tag: "Running", kind: "config" },
  error: null,
  revision: 0,
  operation: 0,
};
