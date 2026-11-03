import { Config, ConfigProvider, Context, Effect, Layer } from "effect";
import { inputError, issue } from "./errors.js";

/** Operational limits for external provider calls.
 *
 * This is deliberately a service rather than a module constant: composition
 * can load it from the environment, while tests can provide a deterministic
 * value without mutating process.env.
 */
export interface ProviderConfig {
  readonly processTimeoutMs: number;
  readonly maxConcurrency: number;
  readonly maxRetries: number;
  readonly retryBaseMs: number;
}

export class ProviderConfigTag extends Context.Service<ProviderConfigTag, ProviderConfig>()(
  "meeting-finder/ProviderConfig",
) {}

const bounded = (name: string, minimum: number, maximum: number, fallback: number) =>
  Config.Int(name).pipe(
    Config.withDefault(fallback),
    Effect.mapError(() =>
      inputError(
        `${name} must be an integer`,
        `Set ${name} to an integer between ${minimum} and ${maximum}`,
        [issue(["config", name], "must be an integer")],
      ),
    ),
    Effect.filterOrFail(
      (value) => value >= minimum && value <= maximum,
      () =>
        inputError(
          `${name} is outside the supported range`,
          `Set ${name} between ${minimum} and ${maximum}`,
          [issue(["config", name], `must be between ${minimum} and ${maximum}`)],
        ),
    ),
  );

/** Loads MEETING_FINDER_* values at layer construction time. */
export const ProviderConfigLive = Layer.effect(
  ProviderConfigTag,
  Effect.gen(function* () {
    return {
      processTimeoutMs: yield* bounded("MEETING_FINDER_GWS_TIMEOUT_MS", 100, 300_000, 60_000),
      maxConcurrency: yield* bounded("MEETING_FINDER_PROVIDER_CONCURRENCY", 1, 20, 2),
      maxRetries: yield* bounded("MEETING_FINDER_PROVIDER_RETRIES", 0, 5, 2),
      retryBaseMs: yield* bounded("MEETING_FINDER_PROVIDER_RETRY_BASE_MS", 1, 30_000, 100),
    } satisfies ProviderConfig;
  }),
);

/** Composition boundary for normal processes: read the host environment. */
export const ProviderConfigEnvLive = ProviderConfigLive.pipe(
  Layer.provide(ConfigProvider.layer(ConfigProvider.fromEnv())),
);

export const ProviderConfigTest = (config: ProviderConfig) =>
  Layer.succeed(ProviderConfigTag, config);
