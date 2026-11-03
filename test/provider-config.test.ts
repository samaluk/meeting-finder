import { ConfigProvider, Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import {
  ProviderConfigLive,
  ProviderConfigTag,
  ProviderConfigTest,
} from "../src/provider-config.js";

describe("provider configuration", () => {
  it("uses safe defaults when no provider settings are supplied", async () => {
    const config = await Effect.runPromise(
      Effect.service(ProviderConfigTag).pipe(
        Effect.provide(
          ProviderConfigLive.pipe(
            Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({}))),
          ),
        ),
      ),
    );
    expect(config).toEqual({
      processTimeoutMs: 60_000,
      maxConcurrency: 2,
      maxRetries: 2,
      retryBaseMs: 100,
    });
  });

  it("rejects unsafe operational limits", async () => {
    const exit = await Effect.runPromiseExit(
      Effect.service(ProviderConfigTag).pipe(
        Effect.provide(
          ProviderConfigLive.pipe(
            Layer.provide(
              ConfigProvider.layer(
                ConfigProvider.fromUnknown({ MEETING_FINDER_GWS_TIMEOUT_MS: "1" }),
              ),
            ),
          ),
        ),
      ),
    );
    expect(exit._tag).toBe("Failure");
  });

  it("reports malformed environment values with their configuration path", async () => {
    const effect = Effect.service(ProviderConfigTag).pipe(
      Effect.provide(
        ProviderConfigLive.pipe(
          Layer.provide(
            ConfigProvider.layer(
              ConfigProvider.fromUnknown({ MEETING_FINDER_PROVIDER_RETRIES: "many" }),
            ),
          ),
        ),
      ),
    );
    await expect(Effect.runPromise(effect)).rejects.toMatchObject({
      code: "invalid_input",
      issues: [{ path: ["config", "MEETING_FINDER_PROVIDER_RETRIES"] }],
    });
  });

  it("supports deterministic test settings without process environment", async () => {
    const config = await Effect.runPromise(
      Effect.service(ProviderConfigTag).pipe(
        Effect.provide(
          ProviderConfigTest({
            processTimeoutMs: 100,
            maxConcurrency: 1,
            maxRetries: 0,
            retryBaseMs: 1,
          }),
        ),
      ),
    );
    expect(config.maxRetries).toBe(0);
  });
});
