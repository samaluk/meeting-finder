import { Effect } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http";
import { HttpApiError } from "effect/http-api";
import { MeetingFinderApi, HttpApiPaths } from "../api.js";
import { issuesFromSchemaError } from "../errors.js";
import { ByteLimitExceeded } from "../bounded-stream.js";
import { InvalidJson, MAX_INPUT_BYTES, readJsonInput } from "../json-input.js";
import { problem } from "./problem.js";
import { discoveryPaths } from "./paths.js";
import type { ConfiguredOptions } from "../http-options.js";
const aliases: Readonly<Record<string, string>> = {
  "/api/resolve": HttpApiPaths.resolve,
  "/api/search": HttpApiPaths.search,
  "/api/sources": HttpApiPaths.sources,
};
const apiMethods = Object.fromEntries(
  Object.values(MeetingFinderApi.groups).flatMap((group) =>
    Object.values(group.endpoints).map((endpoint) => [endpoint.path, endpoint.method]),
  ),
);
const methods: Readonly<Record<string, string>> = {
  ...Object.fromEntries(discoveryPaths.map((path) => [path, "GET"])),
  ...apiMethods,
};
const decodeBody = (request: HttpServerRequest.HttpServerRequest) =>
  readJsonInput(request.stream).pipe(
    Effect.match({
      onSuccess: (body) => ({ ok: true as const, body }),
      onFailure: (error) => ({
        ok: false as const,
        response:
          error instanceof ByteLimitExceeded
            ? problem(413, "Request body is too large")
            : error instanceof InvalidJson
              ? problem(400, "Invalid JSON")
              : problem(400, "Unable to read request body", "Retry with a complete request body"),
      }),
    }),
  );

/** Protocol compatibility runs before route matching; all API work uses the generated routes. */
export const localProtocol = (options: ConfiguredOptions) =>
  HttpRouter.middleware(
    (next) =>
      Effect.gen(function* () {
        const original = yield* HttpServerRequest.HttpServerRequest;
        const url = new URL(original.url, "http://127.0.0.1");
        const host =
          original.headers.host ??
          (original.source instanceof Request ? new URL(original.source.url).host : url.host);
        const localHost = host.split(":")[0] === "127.0.0.1" || host.split(":")[0] === "localhost";
        const proxyHost =
          options.proxyOrigin === undefined ? undefined : new URL(options.proxyOrigin).host;
        if (!localHost && host !== proxyHost)
          return problem(
            403,
            "Host is not allowed",
            "Use the local server or configured proxy origin",
          );
        const origin = original.headers.origin;
        if (
          origin !== undefined &&
          !(localHost && origin === `http://${host}`) &&
          origin !== options.proxyOrigin
        )
          return problem(
            403,
            "Origin is not allowed",
            "Use the local server or configured proxy origin",
          );

        const path = aliases[url.pathname] ?? url.pathname;
        url.pathname = path;
        const expected = methods[path] ?? (path.startsWith("/assets/") ? "GET" : undefined);
        if (expected === undefined) return problem(404, "Route not found");
        if (original.method !== expected)
          return problem(405, "Method Not Allowed", `Use ${expected} for this route`, [], {
            Allow: expected,
          });

        let request = original.modify({ url: url.pathname + url.search });
        if (expected === "POST") {
          if (
            (original.headers["content-type"]?.split(";", 1)[0] ?? "").trim().toLowerCase() !==
            "application/json"
          )
            return problem(415, "Content-Type must be application/json");
          if (Number(original.headers["content-length"] ?? 0) > MAX_INPUT_BYTES)
            return problem(413, "Request body is too large");
          const result = yield* decodeBody(original);
          if (!result.ok) return result.response;
          const body = result.body;
          const object =
            typeof body === "object" && body !== null && !Array.isArray(body) ? body : undefined;
          const explicitMode = object !== undefined && "mode" in object ? object.mode : undefined;
          const mode =
            explicitMode !== undefined
              ? explicitMode
              : (url.searchParams.get("mode") ?? options.mode ?? "live");
          const payload = object !== undefined && "request" in object ? object.request : body;
          const headers = new Headers(original.headers);
          headers.delete("content-length");
          headers.set("content-type", "application/json");
          request = HttpServerRequest.fromWeb(
            new Request(url, {
              method: "POST",
              headers,
              body: JSON.stringify({ mode, request: payload }),
            }),
          );
        }
        return yield* next.pipe(
          Effect.provideService(HttpServerRequest.HttpServerRequest, request),
          Effect.catchDefect((error) =>
            HttpApiError.HttpApiSchemaError.is(error) &&
            ["Payload", "Query", "Params", "Headers"].includes(error.kind)
              ? Effect.succeed(
                  problem(
                    400,
                    "Invalid request input",
                    "Correct the indicated fields",
                    issuesFromSchemaError(error.cause),
                  ),
                )
              : Effect.die(error),
          ),
        );
        // HttpEffect protects response finalization; the pre-route body read must remain cancellable.
      }).pipe(
        Effect.interruptible,
        Effect.map(
          HttpServerResponse.setHeaders({
            "cache-control": "no-store",
            "referrer-policy": "no-referrer",
            "x-content-type-options": "nosniff",
            "x-frame-options": "DENY",
            "content-security-policy":
              "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
          }),
        ),
      ),
    { global: true },
  );
