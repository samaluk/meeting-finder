import { Schema } from "effect";
import { RequestInputSchema, SourceSchema } from "./request.js";
import { ParticipantSchemaResolved, OverrideSchema } from "./participant.js";
import { DirectoryMemberSchema, OmittedMemberSchema } from "./directory.js";

export const SourceResolutionSchema = Schema.Struct({
  source: SourceSchema,
  members: Schema.Array(DirectoryMemberSchema),
  omitted: Schema.Array(OmittedMemberSchema),
});
export type SourceResolution = Schema.Schema.Type<typeof SourceResolutionSchema>;

export const ResolvedAudienceSchema = Schema.Struct({
  request: RequestInputSchema,
  participants: Schema.Array(ParticipantSchemaResolved),
  sources: Schema.Array(SourceResolutionSchema),
  total: Schema.Int,
  requiredCount: Schema.Int,
  optionalCount: Schema.Int,
  overrides: Schema.Array(OverrideSchema),
});
export type ResolvedAudience = Schema.Schema.Type<typeof ResolvedAudienceSchema>;
