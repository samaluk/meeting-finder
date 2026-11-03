import { Clock, Effect, Layer } from "effect";
import { HttpApiBuilder } from "effect/http-api";
import { MeetingFinderApi } from "../api.js";
import { MeetingFinder } from "../meeting-finder.js";
import { initialRequest } from "../defaults.js";
import { Directory } from "../providers.js";
import { providerLayer } from "../layers.js";
import { domainProblem } from "./problem.js";
import type { ConfiguredOptions } from "../http-options.js";
export const apiRoutes = (options: ConfiguredOptions) => {
  const configuredMode = options.mode ?? "live";
  const meeting = HttpApiBuilder.group(MeetingFinderApi, "meeting", (group) =>
    group.handleAll({
      resolve: ({ payload }) =>
        MeetingFinder.resolve(payload.request).pipe(
          Effect.provide(options.layer ?? providerLayer(payload.mode)),
          Effect.map((audience) => ({ ...audience, mode: payload.mode })),
          Effect.mapError(domainProblem),
        ),
      search: ({ payload }) =>
        MeetingFinder.search(payload.request).pipe(
          Effect.provide(options.layer ?? providerLayer(payload.mode)),
          Effect.map((result) => ({ ...result, mode: payload.mode })),
          Effect.mapError(domainProblem),
        ),
      config: ({ query }) =>
        Effect.gen(function* () {
          const mode = query.mode ?? configuredMode;
          const request =
            options.config === undefined
              ? initialRequest({
                  demo: mode === "demo",
                  now: new Date(yield* Clock.currentTimeMillis),
                })
              : options.config;
          return { mode, request };
        }),
    }),
  );
  const sources = HttpApiBuilder.group(MeetingFinderApi, "sources", (group) =>
    group.handleAll({
      list: ({ query }) => {
        const mode = query.mode ?? configuredMode;
        return Effect.flatMap(Directory, (directory) => directory.list(query.kind)).pipe(
          Effect.provide(options.layer ?? providerLayer(mode)),
          Effect.map((sources) => ({ mode, sources })),
          Effect.mapError(domainProblem),
        );
      },
    }),
  );
  return HttpApiBuilder.layer(MeetingFinderApi).pipe(Layer.provide([meeting, sources]));
};
