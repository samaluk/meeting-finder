import { Context, Effect, Layer, Ref, Schedule, type Stream } from "effect";
import { ChildProcess } from "effect/process";
import { ChildProcessSpawner } from "effect/process/ChildProcessSpawner";
import { ByteLimitExceeded, readBoundedText } from "../bounded-stream.js";
import {
  isFinderError,
  providerResponse,
  providerUnavailable,
  type FinderError,
} from "../errors.js";
import { gwsFailure, transientGwsFailure } from "./gws-diagnostics.js";
import { ProviderConfigEnvLive, ProviderConfigTag } from "../provider-config.js";

export interface GwsProcessResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

export interface GwsProcess {
  readonly run: (args: ReadonlyArray<string>) => Effect.Effect<GwsProcessResult, FinderError>;
  /** Provider-level bound shared by all fan-out operations. */
  readonly concurrency?: number;
}

export class GwsProcessTag extends Context.Service<GwsProcessTag, GwsProcess>()(
  "meeting-finder/GwsProcess",
) {}

const MAX_OUTPUT = 10 * 1024 * 1024;

const unavailable = (
  detail: string,
  resolution = "Check gws authentication and provider access",
): FinderError => providerUnavailable(detail, resolution);

const invalidOutput = (detail: string): FinderError =>
  providerResponse(detail, "Check the gws response and provider API version");

const boundedText = (stream: Stream.Stream<Uint8Array, unknown>) =>
  readBoundedText(stream, MAX_OUTPUT).pipe(
    Effect.mapError((cause) =>
      cause instanceof ByteLimitExceeded
        ? invalidOutput("gws output exceeded the 10 MiB stream limit")
        : cause,
    ),
  );

export const makeGwsProcessLive = (
  executable = "gws",
  configLayer: Layer.Layer<ProviderConfigTag, FinderError, never> = ProviderConfigEnvLive,
) =>
  Layer.effect(
    GwsProcessTag,
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner;
      const config = yield* ProviderConfigTag;
      const retrySchedule = Schedule.exponential(`${config.retryBaseMs} millis`).pipe(
        Schedule.jittered,
        Schedule.upTo({ times: config.maxRetries }),
      );
      const attempt = (args: ReadonlyArray<string>) =>
        Effect.scoped(
          Effect.gen(function* () {
            const handle = yield* spawner.spawn(
              ChildProcess.make(executable, args, {
                stdin: "ignore",
                stdout: "pipe",
                stderr: "pipe",
                shell: false,
                extendEnv: true,
              }),
            );
            const [stdout, stderr, exitCode] = yield* Effect.all(
              [boundedText(handle.stdout), boundedText(handle.stderr), handle.exitCode],
              { concurrency: "unbounded" },
            );
            return { stdout, stderr, exitCode: Number(exitCode) };
          }),
        ).pipe(
          Effect.timeoutOrElse({
            duration: config.processTimeoutMs,
            orElse: () => Effect.fail(unavailable("gws process timed out")),
          }),
          Effect.mapError((cause) =>
            isFinderError(cause) ? cause : unavailable("Unable to start or read the gws process"),
          ),
        );
      return {
        concurrency: config.maxConcurrency,
        run: Effect.fn("meeting-finder.provider.gws.process")(function* (
          args: ReadonlyArray<string>,
        ) {
          const last = yield* Ref.make<GwsProcessResult | undefined>(undefined);
          const retryable = Effect.gen(function* () {
            yield* Ref.set(last, undefined);
            return yield* attempt(args);
          }).pipe(
            Effect.tap((result) => Ref.set(last, result)),
            Effect.filterOrFail(
              (result) => result.exitCode === 0 || !transientGwsFailure(result.stderr),
              (result) => gwsFailure(result.stderr, result.exitCode),
            ),
            Effect.retry({
              schedule: retrySchedule,
              while: (failure) => isFinderError(failure) && transientGwsFailure(failure.detail),
            }),
          );
          return yield* retryable.pipe(
            Effect.catchIf(
              (failure): failure is FinderError =>
                isFinderError(failure) && transientGwsFailure(failure.detail),
              () =>
                Ref.get(last).pipe(
                  Effect.filterOrFail(
                    (result): result is GwsProcessResult => result !== undefined,
                    () => unavailable("gws transient failure"),
                  ),
                ),
            ),
          );
        }),
      } satisfies GwsProcess;
    }),
  ).pipe(Layer.provide(configLayer));

export const GwsProcessLive = makeGwsProcessLive();
