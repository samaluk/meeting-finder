import type { SourceInput } from "../domain/request.js";
import type { OverrideInput } from "../domain/participant.js";
import { inputError, type FinderError } from "../errors.js";
export const help = `meeting-finder — explainable meeting times

Commands:
  init [--demo]
  sources spaces|contacts [--demo]
  resolve [input|-] [--config file] [--demo] [source flags] [override flags]
  search [input|-] [--config file] [--demo] [--text] [source flags] [override flags]
  schema
  capabilities
  serve [--config file] [--port number] [--demo] [--proxy-origin https://host:port]

Source flags (repeatable): --person/--people, --space, --group, --contacts, --emails,
  and their --optional-* forms. Override flags: --optional id[=weight], --required id[=weight].
Rule flags: --start-date, --end-date, --timezone, --duration, --step, --buffer,
  --min-attendance, --max-results.

Input is JSON. Per-person attendanceRule supports full, start/end minutes, or continuous percentage
  on participants, participantDefaults, or overrides; see schema. Errors are JSON on stdout and exit with code 1.`;

const error = (detail: string, resolution = "Correct the command input") =>
  inputError(detail, resolution);

export type Parsed = {
  command: string;
  rest: string[];
  flags: Map<string, string[]>;
  positional: string[];
  text: boolean;
  demo: boolean;
  diagnostic?: string;
};

export const parse = (args: ReadonlyArray<string>): Parsed => {
  const list = [...args];
  // Bun's Stdio args are normally argv.slice(2), but test layers often provide argv.
  if (list[0]?.endsWith("bun") || list[0]?.endsWith("bun.exe")) list.splice(0, 2);
  const command = list.shift() ?? "help";
  const flags = new Map<string, string[]>();
  const positional: string[] = [];
  let text = false;
  let demo = false;
  let diagnostic: string | undefined;
  const known = new Set([
    "config",
    "person",
    "people",
    "optional-person",
    "space",
    "optional-space",
    "group",
    "optional-group",
    "contacts",
    "optional-contacts",
    "emails",
    "optional-emails",
    "required",
    "optional",
    "start-date",
    "end-date",
    "timezone",
    "duration",
    "step",
    "buffer",
    "min-attendance",
    "max-results",
    "port",
    "proxy-origin",
    "help",
  ]);
  for (let i = 0; i < list.length; i++) {
    const arg = list[i]!;
    if (arg === "--help" || arg === "-h") {
      flags.set("help", []);
      continue;
    }
    if (arg === "--text") {
      text = true;
      continue;
    }
    if (arg === "--demo") {
      demo = true;
      continue;
    }
    if (arg.startsWith("--")) {
      const separator = arg.indexOf("=");
      const key = separator === -1 ? arg.slice(2) : arg.slice(2, separator);
      if (!known.has(key) && diagnostic === undefined) diagnostic = `Unknown option: --${key}`;
      const value =
        separator === -1
          ? list[i + 1]?.startsWith("-")
            ? ""
            : (list[++i] ?? "")
          : arg.slice(separator + 1);
      if (value === "" && diagnostic === undefined) diagnostic = `Missing value for --${key}`;
      const values = flags.get(key) ?? [];
      values.push(value);
      flags.set(key, values);
    } else positional.push(arg);
  }
  return {
    command,
    rest: list,
    flags,
    positional,
    text,
    demo,
    ...(diagnostic === undefined ? {} : { diagnostic }),
  };
};

export const flag = (parsed: Parsed, name: string) => parsed.flags.get(name)?.at(-1);
export const allFlags = (parsed: Parsed, names: ReadonlyArray<string>) =>
  names.flatMap((name) => parsed.flags.get(name) ?? []);
export const numberFlag = (parsed: Parsed, name: string) => {
  const value = flag(parsed, name);
  return value === undefined ? undefined : Number(value);
};

export const sourceFlags = (parsed: Parsed): ReadonlyArray<SourceInput> => {
  const required: SourceInput[] = [];
  const optional: SourceInput[] = [];
  const append = (
    target: SourceInput[],
    type: SourceInput["type"],
    values: ReadonlyArray<string>,
    isRequired: boolean,
  ) => {
    for (const ref of values) target.push({ type, ref, required: isRequired });
  };
  append(required, "person", allFlags(parsed, ["person", "people"]), true);
  append(optional, "person", allFlags(parsed, ["optional-person"]), false);
  append(required, "chat_space", allFlags(parsed, ["space"]), true);
  append(optional, "chat_space", allFlags(parsed, ["optional-space"]), false);
  append(required, "google_group", allFlags(parsed, ["group"]), true);
  append(optional, "google_group", allFlags(parsed, ["optional-group"]), false);
  append(required, "contact_group", allFlags(parsed, ["contacts"]), true);
  append(optional, "contact_group", allFlags(parsed, ["optional-contacts"]), false);
  append(required, "emails", allFlags(parsed, ["emails"]), true);
  append(optional, "emails", allFlags(parsed, ["optional-emails"]), false);
  // Parser contract: all required sources precede optional sources independent of argv order.
  return [...required, ...optional];
};

export const overrides = (parsed: Parsed): ReadonlyArray<OverrideInput> => {
  const required = allFlags(parsed, ["required"]);
  const optional = allFlags(parsed, ["optional"]);
  const parseOne = (value: string, isRequired: boolean): OverrideInput => {
    const [id, weightText] = value.split("=", 2);
    const weight = weightText === undefined ? undefined : Number(weightText);
    return {
      id: id!,
      required: isRequired,
      ...(weight === undefined || Number.isNaN(weight) ? {} : { weight }),
    };
  };
  // Required overrides are applied after optional overrides regardless of argv order.
  return [
    ...optional.map((value) => parseOne(value, false)),
    ...required.map((value) => parseOne(value, true)),
  ];
};

export const validateFlags = (parsed: Parsed): FinderError | undefined => {
  if (parsed.diagnostic !== undefined) return error(parsed.diagnostic, "Run meeting-finder --help");
  for (const value of allFlags(parsed, ["required", "optional"])) {
    const parts = value.split("=");
    if (
      parts.length > 2 ||
      parts[0] === "" ||
      (parts.length === 2 &&
        (!/^\d+$/u.test(parts[1]!) || Number(parts[1]) < 1 || Number(parts[1]) > 100))
    )
      return error(
        `Invalid participant override: ${value}`,
        "Use --required id[=1..100] or --optional id[=1..100]",
      );
  }
  return undefined;
};
