#!/usr/bin/env bun
import { Effect, Stdio } from "effect";
import { BunRuntime, BunServices } from "@effect/platform-bun";
import { runCli } from "./cli.js";
import { formatError, writeResult } from "./cli-output.js";
import { localTracingLayer } from "./observability.js";

const command = Effect.gen(function* () {
  const stdio = yield* Stdio.Stdio;
  const args = yield* stdio.args;
  const result = yield* runCli(args);
  yield* writeResult(result, stdio);
}).pipe(Effect.provide(localTracingLayer((line) => process.stderr.write(line))));

const program = command.pipe(
  Effect.scoped,
  Effect.catch((cause) =>
    Effect.gen(function* () {
      const stdio = yield* Stdio.Stdio;
      yield* writeResult({ value: formatError(cause), exitCode: 1 }, stdio);
      yield* Effect.sync(() => {
        process.exitCode = 1;
      });
    }),
  ),
  Effect.provide(BunServices.layer),
);

BunRuntime.runMain(program, { disableErrorReporting: true });

export { program };
