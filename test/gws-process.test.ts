import { BunServices } from "@effect/platform-bun";
import { Effect, Layer } from "effect";
import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GwsProcessTag, makeGwsProcessLive } from "../src/adapters/gws-process.js";
import { ProviderConfigTest } from "../src/provider-config.js";

const executable = async (body: string) => {
  const directory = await mkdtemp(join(tmpdir(), "meeting-finder-gws-"));
  const file = join(directory, "fake-gws");
  await writeFile(file, `#!/bin/sh\n${body}\n`);
  await chmod(file, 0o755);
  return file;
};

describe("live gws process boundary", () => {
  it("drains stdout and stderr concurrently and preserves both", async () => {
    const file = await executable("printf '{\"ok\":true}'; printf 'diagnostic\\n' >&2");
    const process = await Effect.runPromise(
      Effect.service(GwsProcessTag).pipe(
        Effect.flatMap((service) => service.run(["version"])),
        Effect.provide(makeGwsProcessLive(file).pipe(Layer.provide(BunServices.layer))),
      ),
    );
    expect(process.stdout).toBe('{"ok":true}');
    expect(process.stderr).toContain("diagnostic");
    expect(process.exitCode).toBe(0);
  });

  it("never inherits interactive stdin for provider commands", async () => {
    const file = await executable("if read -r input; then exit 1; fi; printf closed");
    const result = await Effect.runPromise(
      Effect.service(GwsProcessTag).pipe(
        Effect.flatMap((service) => service.run([])),
        Effect.provide(makeGwsProcessLive(file).pipe(Layer.provide(BunServices.layer))),
      ),
    );
    expect(result.stdout).toBe("closed");
    expect(result.exitCode).toBe(0);
  });

  it("reports non-zero exits with bounded stderr", async () => {
    const file = await executable("printf 'failure detail' >&2; exit 7");
    const process = await Effect.runPromise(
      Effect.service(GwsProcessTag).pipe(
        Effect.flatMap((service) => service.run([])),
        Effect.provide(makeGwsProcessLive(file).pipe(Layer.provide(BunServices.layer))),
      ),
    );
    expect(process.exitCode).toBe(7);
    expect(process.stderr).toContain("failure detail");
  });

  it("fails and interrupts a process that exceeds the configured timeout", async () => {
    const file = await executable("exec sleep 2");
    const exit = await Effect.runPromiseExit(
      Effect.service(GwsProcessTag).pipe(
        Effect.flatMap((service) => service.run([])),
        Effect.provide(
          makeGwsProcessLive(
            file,
            ProviderConfigTest({
              processTimeoutMs: 1_000,
              maxConcurrency: 2,
              maxRetries: 2,
              retryBaseMs: 1,
            }),
          ).pipe(Layer.provide(BunServices.layer)),
        ),
      ),
    );
    expect(exit._tag).toBe("Failure");
  });

  it("releases the child process when interrupted by the timeout", async () => {
    const directory = await mkdtemp(join(tmpdir(), "meeting-finder-gws-cancel-"));
    const pidFile = join(directory, "pid");
    const file = await executable(`printf '%s' $$ > '${pidFile}'; exec sleep 2`);
    const exit = await Effect.runPromiseExit(
      Effect.service(GwsProcessTag).pipe(
        Effect.flatMap((service) => service.run([])),
        Effect.provide(
          makeGwsProcessLive(
            file,
            ProviderConfigTest({
              processTimeoutMs: 1_000,
              maxConcurrency: 2,
              maxRetries: 2,
              retryBaseMs: 1,
            }),
          ).pipe(Layer.provide(BunServices.layer)),
        ),
      ),
    );
    expect(exit._tag).toBe("Failure");
    const pid = Number(await readFile(pidFile, "utf8"));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(() => process.kill(pid, 0)).toThrow();
  });

  it("rejects output over the ten MiB per-stream limit", async () => {
    const file = await executable("head -c 10485761 /dev/zero");
    const exit = await Effect.runPromiseExit(
      Effect.service(GwsProcessTag).pipe(
        Effect.flatMap((service) => service.run([])),
        Effect.provide(makeGwsProcessLive(file).pipe(Layer.provide(BunServices.layer))),
      ),
    );
    expect(exit._tag).toBe("Failure");
  });

  it("retries a transient provider failure and preserves bounded attempts", async () => {
    const directory = await mkdtemp(join(tmpdir(), "meeting-finder-gws-retry-"));
    const count = join(directory, "count");
    await writeFile(count, "0");
    const file = await executable(
      `n=$(cat '${count}'); n=$((n + 1)); printf '%s' "$n" > '${count}'; if [ "$n" -lt 3 ]; then printf '503 service unavailable' >&2; exit 1; fi; printf ok`,
    );
    let configuredConcurrency = 0;
    const result = await Effect.runPromise(
      Effect.service(GwsProcessTag).pipe(
        Effect.flatMap((service) => {
          configuredConcurrency = service.concurrency ?? 0;
          return service.run([]);
        }),
        Effect.provide(
          makeGwsProcessLive(
            file,
            ProviderConfigTest({
              processTimeoutMs: 1_000,
              maxConcurrency: 1,
              maxRetries: 2,
              retryBaseMs: 1,
            }),
          ).pipe(Layer.provide(BunServices.layer)),
        ),
      ),
    );
    expect(configuredConcurrency).toBe(1);
    expect(result.stdout).toBe("ok");
    expect(await readFile(count, "utf8")).toBe("3");
  });

  it("does not retry a permission failure", async () => {
    const directory = await mkdtemp(join(tmpdir(), "meeting-finder-gws-no-retry-"));
    const count = join(directory, "count");
    await writeFile(count, "0");
    const file = await executable(
      `n=$(cat '${count}'); n=$((n + 1)); printf '%s' "$n" > '${count}'; printf '403 permission denied' >&2; exit 1`,
    );
    const result = await Effect.runPromise(
      Effect.service(GwsProcessTag).pipe(
        Effect.flatMap((service) => service.run([])),
        Effect.provide(
          makeGwsProcessLive(
            file,
            ProviderConfigTest({
              processTimeoutMs: 1_000,
              maxConcurrency: 1,
              maxRetries: 2,
              retryBaseMs: 1,
            }),
          ).pipe(Layer.provide(BunServices.layer)),
        ),
      ),
    );
    expect(result.exitCode).toBe(1);
    expect(await readFile(count, "utf8")).toBe("1");
  });
});
