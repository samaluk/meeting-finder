import { providerUnavailable, type FinderError } from "../errors.js";

// Provider stderr is untrusted: it may include credentials, identities, URLs or local paths.
// Classify it for recovery and retry decisions; never copy it into application errors.
const failureKind = (stderr: string) => {
  if (
    /\b401\b|unauthori[sz]ed|invalid credential|authentication failed|invalid_grant|invalid_token/i.test(
      stderr,
    )
  )
    return "authentication";
  if (/\b403\b|permission denied|access denied|forbidden|insufficient.*scope/i.test(stderr))
    return "permission";
  if (
    /\b429\b|\b500\b|\b502\b|\b503\b|\b504\b|temporarily unavailable|resource[_ ]exhausted|deadline exceeded|timed out|timeout/i.test(
      stderr,
    )
  )
    return "transient";
  return "other";
};
export const transientGwsFailure = (stderr: string): boolean => failureKind(stderr) === "transient";
export const gwsFailure = (stderr: string, exitCode: number): FinderError => {
  const kind = failureKind(stderr);
  if (kind === "authentication" || exitCode === 2)
    return providerUnavailable(
      "gws authentication failed",
      "Run gws auth status in the same shell and account context; renew authorization only if that check requires it",
    );
  if (kind === "permission")
    return providerUnavailable(
      "gws access was denied",
      "Check the selected gws account, resource access and granted read scopes",
    );
  return providerUnavailable(
    kind === "transient" ? "gws is temporarily unavailable" : "gws command failed",
    kind === "transient"
      ? "Retry the request"
      : "Check gws installation, authentication status and provider access locally",
  );
};
