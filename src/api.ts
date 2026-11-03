/**
 * The public HTTP contract.  Keep this declaration next to the domain schemas:
 * Effect uses it to derive the client shape and the OpenAPI document, while
 * `http.ts` remains responsible for the compatibility adapter and safeguards
 * needed by the local/Tailscale server.
 */
import { Schema } from "effect";
import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api";
import { RequestInputSchema, SearchInputSchema } from "./domain/request.js";
import { ResolvedAudienceSchema } from "./domain/audience.js";
import { SearchResultSchema } from "./domain/search.js";
import { FinderIssueSchema } from "./errors.js";
import { DirectoryKindSchema, SourceSummarySchema } from "./domain/directory.js";

import { ModeSchema as HttpModeSchema } from "./mode.js";
export { ModeSchema as HttpModeSchema, type Mode as HttpMode } from "./mode.js";

export const HttpApiPaths = {
  resolve: "/api/v1/resolve",
  search: "/api/v1/search",
  sources: "/api/v1/sources",
  config: "/api/v1/config",
} as const;

export const ProblemSchema = Schema.Struct({
  type: Schema.String,
  title: Schema.String,
  status: Schema.Finite,
  detail: Schema.String,
  resolution: Schema.String,
  code: Schema.String,
  category: Schema.Literals(["input", "provider"]),
  issues: Schema.Array(FinderIssueSchema),
});
export const InputProblemSchema = Schema.Struct({
  ...ProblemSchema.fields,
  category: Schema.Literal("input"),
}).pipe(
  HttpApiSchema.status(400),
  HttpApiSchema.asJson({ contentType: "application/problem+json" }),
);
export const ProviderProblemSchema = Schema.Struct({
  ...ProblemSchema.fields,
  category: Schema.Literal("provider"),
}).pipe(
  HttpApiSchema.status(502),
  HttpApiSchema.asJson({ contentType: "application/problem+json" }),
);
export const HttpErrorSchema = Schema.Union([InputProblemSchema, ProviderProblemSchema]);

export const ResolveEnvelopeSchema = Schema.Struct({
  mode: HttpModeSchema,
  request: RequestInputSchema,
}).annotate({ identifier: "ResolveEnvelope" });
export const SearchEnvelopeSchema = Schema.Struct({
  mode: HttpModeSchema,
  request: SearchInputSchema,
}).annotate({ identifier: "SearchEnvelope" });

const resolveResponse = Schema.Struct({
  ...ResolvedAudienceSchema.fields,
  mode: HttpModeSchema,
}).annotate({ identifier: "ResolveResponse" });
const searchResponse = Schema.Struct({
  ...SearchResultSchema.fields,
  mode: HttpModeSchema,
}).annotate({ identifier: "SearchResponse" });
const configResponse = Schema.Struct({ mode: HttpModeSchema, request: RequestInputSchema });
const sourcesResponse = Schema.Struct({
  mode: HttpModeSchema,
  sources: Schema.Array(SourceSummarySchema),
});

const errors = [InputProblemSchema, ProviderProblemSchema] as const;

export const MeetingFinderApi = HttpApi.make("MeetingFinder")
  .add(
    HttpApiGroup.make("meeting", { topLevel: false }).add(
      HttpApiEndpoint.post("resolve", HttpApiPaths.resolve, {
        payload: ResolveEnvelopeSchema,
        success: resolveResponse,
        error: errors,
      }),
      HttpApiEndpoint.post("search", HttpApiPaths.search, {
        payload: SearchEnvelopeSchema,
        success: searchResponse,
        error: errors,
      }),
      HttpApiEndpoint.get("config", HttpApiPaths.config, {
        query: { mode: Schema.optional(HttpModeSchema) },
        success: configResponse,
        error: errors,
      }),
    ),
  )
  .add(
    HttpApiGroup.make("sources", { topLevel: false }).add(
      HttpApiEndpoint.get("list", HttpApiPaths.sources, {
        query: {
          kind: DirectoryKindSchema,
          mode: Schema.optional(HttpModeSchema),
        },
        success: sourcesResponse,
        error: errors,
      }),
    ),
  );

export type MeetingFinderApiClient = import("effect/http-api").HttpApiClient.ForApi<
  typeof MeetingFinderApi
>;

export { RequestInputSchema, ResolvedAudienceSchema, SearchInputSchema, SearchResultSchema };
