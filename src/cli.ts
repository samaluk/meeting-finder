import { Clock, Effect, FileSystem, Stdio, Stream } from "effect";
import { MeetingFinder } from "./meeting-finder.js";
import { inputError } from "./errors.js";
import { initialRequest } from "./defaults.js";
import { providerLayer } from "./layers.js";
import { getCapabilities, getInputSchema } from "./discovery.js";
import { Directory } from "./providers.js";
import { validateProxyOrigin } from "./http-options.js";
import { MAX_INPUT_BYTES } from "./json-input.js";
import { parse, flag, numberFlag, validateFlags, help } from "./cli/arguments.js";
import { readInput, readJson } from "./cli/input.js";
import { textResult } from "./cli-output.js";
const error = (detail: string, resolution = "Correct the command input") =>
  inputError(detail, resolution);
const schema = getInputSchema();
const capabilities = getCapabilities();
export const runCli = Effect.fn("CLI.run")(function* (args: ReadonlyArray<string>) {
  const parsed = parse(args);
  const stdio = yield* Stdio.Stdio;
  const fs = yield* FileSystem.FileSystem;
  const now = new Date(yield* Clock.currentTimeMillis);
  const flagError = validateFlags(parsed);
  if (flagError !== undefined) return yield* flagError;
  if (parsed.flags.has("help") || parsed.command === "help" || parsed.command === "--help")
    return { value: help, text: help };
  if (parsed.command === "schema") return { value: schema };
  if (parsed.command === "capabilities") return { value: capabilities };
  if (parsed.command === "init") return { value: initialRequest({ demo: parsed.demo, now }) };
  if (parsed.command === "sources") {
    if (
      parsed.positional[0] !== undefined &&
      parsed.positional[0] !== "spaces" &&
      parsed.positional[0] !== "contacts"
    )
      return yield* error(`Unknown source kind: ${parsed.positional[0]}`, "Use spaces or contacts");
    const kind = parsed.positional[0] === "contacts" ? "contact_group" : "chat_space";
    const sources = yield* Effect.flatMap(Directory, (directory) => directory.list(kind)).pipe(
      Effect.provide(providerLayer(parsed.demo ? "demo" : "live")),
    );
    return { value: { mode: parsed.demo ? "demo" : "live", kind, sources } };
  }
  if (parsed.command === "serve") {
    const { serve } = yield* Effect.promise(() => import("./http.js"));
    const mode = parsed.demo ? "demo" : "live";
    const port = numberFlag(parsed, "port") ?? 4310;
    const proxyOrigin = yield* validateProxyOrigin(flag(parsed, "proxy-origin"));
    const configFile = flag(parsed, "config");
    const config =
      configFile === undefined
        ? undefined
        : yield* readJson(fs.stream(configFile, { bytesToRead: MAX_INPUT_BYTES + 1 }));
    return yield* serve({
      port,
      mode,
      config,
      ...(proxyOrigin === undefined ? {} : { proxyOrigin }),
      onListening: (address) =>
        Stream.succeed(`meeting-finder listening on ${address}\n`).pipe(Stream.run(stdio.stderr())),
    });
  }
  if (parsed.command !== "resolve" && parsed.command !== "search")
    return yield* error(`Unknown command: ${parsed.command}`, "Run meeting-finder --help");
  const request = yield* readInput(parsed, fs, stdio, now);
  const mode = parsed.demo ? "demo" : "live";
  if (parsed.command === "resolve") {
    const audience = yield* MeetingFinder.resolve(request).pipe(
      Effect.provide(providerLayer(mode)),
    );
    return { value: { ...audience, mode } };
  }
  const result = yield* MeetingFinder.search(request).pipe(Effect.provide(providerLayer(mode)));
  return {
    value: { ...result, mode },
    ...(parsed.text ? { text: textResult(result) } : {}),
  };
});
