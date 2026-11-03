import { Schema } from "effect";
import type { SourceType } from "./request.js";

/** Collection sources need a directory; explicit identities are resolved locally. */
export type ExternalSourceType = Exclude<SourceType, "person" | "emails">;
export interface ExternalSource {
  readonly type: ExternalSourceType;
  readonly ref: string;
}

export const DirectoryMemberSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.optional(Schema.String),
});
export type DirectoryMember = Schema.Schema.Type<typeof DirectoryMemberSchema>;

export const OmittedMemberSchema = Schema.Struct({
  id: Schema.optional(Schema.String),
  reason: Schema.String,
});
export type OmittedMember = Schema.Schema.Type<typeof OmittedMemberSchema>;

export const DirectoryResultSchema = Schema.Struct({
  members: Schema.Array(DirectoryMemberSchema),
  omitted: Schema.Array(OmittedMemberSchema),
});
export type DirectoryResult = Schema.Schema.Type<typeof DirectoryResultSchema>;
export const DirectoryKindSchema = Schema.Literals(["chat_space", "contact_group"]);
export type DirectoryKind = Schema.Schema.Type<typeof DirectoryKindSchema>;
export const SourceSummarySchema = Schema.Struct({
  id: Schema.String,
  name: Schema.optional(Schema.String),
  kind: DirectoryKindSchema,
});
export type SourceSummary = Schema.Schema.Type<typeof SourceSummarySchema>;
