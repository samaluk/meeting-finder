import { Effect, Layer, Schema } from "effect";
import { RequestInputSchema } from "./domain/request.js";
import type { Mode } from "./mode.js";
import type { CalendarAvailability, Directory } from "./providers.js";
import { inputError, issuesFromSchemaError, type FinderError } from "./errors.js";
type ProviderLayer = Layer.Layer<Directory | CalendarAvailability, FinderError, never>;
export type HandlerOptions = {
  readonly mode?: Mode;
  readonly layer?: ProviderLayer;
  readonly config?: unknown;
  readonly proxyOrigin?: string;
};
export type ConfiguredOptions = Omit<HandlerOptions, "config"> & {
  readonly config?: Schema.Schema.Type<typeof RequestInputSchema>;
};
/** Both CLI and programmatic entry points require one explicit HTTPS origin. */
export const validateProxyOrigin = (
  input: string | undefined,
): Effect.Effect<string | undefined, FinderError> => {
  const invalid = () =>
    inputError(
      "Invalid proxy origin",
      "Use an HTTPS origin without a path, credentials, query, or fragment",
      [{ path: ["proxyOrigin"], message: "Expected an HTTPS origin" }],
    );
  return input === undefined
    ? Effect.succeed(input)
    : Effect.try({ try: () => new URL(input), catch: invalid }).pipe(
        Effect.filterOrFail(
          (url) =>
            url.protocol === "https:" &&
            url.pathname === "/" &&
            url.username === "" &&
            url.password === "" &&
            url.search === "" &&
            url.hash === "",
          invalid,
        ),
        Effect.map((url) => url.origin),
      );
};
export const configureHttp = (options: HandlerOptions) =>
  Effect.gen(function* () {
    const proxyOrigin = yield* validateProxyOrigin(options.proxyOrigin);
    const config =
      options.config === undefined
        ? undefined
        : yield* Schema.decodeUnknownEffect(RequestInputSchema)(options.config).pipe(
            Effect.mapError((cause) =>
              inputError(
                "Invalid prepared configuration",
                "Correct the configuration file",
                issuesFromSchemaError(cause),
              ),
            ),
          );
    const configured: ConfiguredOptions = {
      ...(options.mode === undefined ? {} : { mode: options.mode }),
      ...(options.layer === undefined ? {} : { layer: options.layer }),
      ...(proxyOrigin === undefined ? {} : { proxyOrigin }),
      ...(config === undefined ? {} : { config }),
    };
    return configured;
  });
