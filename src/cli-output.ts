import { Effect, Stdio, Stream } from "effect";
import type { SearchResult, MeetingCandidate } from "./domain/search.js";
import { isFinderError } from "./errors.js";
export type CommandResult = {
  readonly value: unknown;
  readonly text?: string;
  readonly exitCode?: number;
};
export const textResult = (value: SearchResult) => {
  if (value.candidates)
    return (
      value.candidates
        .map(
          (candidate: MeetingCandidate) =>
            `${candidate.start} — ${candidate.end} (${candidate.score}% rule coverage)
${candidate.participants
  .filter((person) => person.attendanceRule.type !== "full")
  .map(
    (person) =>
      `  ${person.participantId}: ${JSON.stringify(person.attendanceRule)}, ${person.ruleSatisfied ? "met" : "not met"}; free portions: ${person.availableIntervals.map((portion) => `${portion.start}–${portion.end}`).join(", ") || "none confirmed"}`,
  )
  .join("\n")}`,
        )
        .join("\n") || "No valid candidates"
    );
  return JSON.stringify(value, null, 2);
};
export const writeResult = (
  result: CommandResult,
  stdio: Stdio.Stdio,
): Effect.Effect<void, unknown> => {
  const value = result.text ?? JSON.stringify(result.value);
  return Stream.succeed(value + "\n").pipe(Stream.run(stdio.stdout()));
};

export const formatError = (cause: unknown) =>
  isFinderError(cause)
    ? {
        code: cause.code,
        detail: cause.detail,
        resolution: cause.resolution,
        category: cause.category,
        issues: cause.issues,
      }
    : {
        code: "internal_error",
        detail: "The command could not be completed",
        resolution: "Inspect the command and try again",
      };
