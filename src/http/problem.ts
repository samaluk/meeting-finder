import type { Schema } from "effect";
import { HttpServerResponse } from "effect/http";
import type { ProblemSchema } from "../api.js";
import type { FinderError, FinderIssue } from "../errors.js";
type Problem = Schema.Schema.Type<typeof ProblemSchema>;
export const problem = (
  status: number,
  detail: string,
  resolution = "Correct the request",
  issues: ReadonlyArray<FinderIssue> = [],
  headers?: Record<string, string>,
) =>
  HttpServerResponse.text(
    JSON.stringify({
      type: "about:blank",
      title: detail,
      status,
      detail,
      resolution,
      code: "invalid_input",
      category: "input",
      issues,
    } satisfies Problem),
    { status, contentType: "application/problem+json", headers },
  );

export const domainProblem = (error: FinderError): Problem => ({
  type: "about:blank",
  title: error.detail,
  status: error.category === "provider" ? 502 : 400,
  ...error,
});
