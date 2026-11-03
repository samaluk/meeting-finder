import { describe, expect, it } from "vitest";
import { unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const run = (
  args: ReadonlyArray<string>,
  stdin?: string,
  environment?: Readonly<Record<string, string>>,
) => {
  const processResult = Bun.spawnSync([process.execPath, "src/main.ts", ...args], {
    cwd: process.cwd(),
    env: { ...process.env, ...environment },
    stdin: stdin === undefined ? undefined : new TextEncoder().encode(stdin),
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    code: processResult.exitCode,
    stdout: new TextDecoder().decode(processResult.stdout),
    stderr: new TextDecoder().decode(processResult.stderr),
  };
};

describe("meeting-finder CLI", () => {
  it("announces the actual ephemeral server address only after it is ready", async () => {
    const child = Bun.spawn([process.execPath, "src/main.ts", "serve", "--demo", "--port", "0"], {
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
    });
    const reader = child.stderr.getReader();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const readiness = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error("server readiness was not reported")), 5_000);
        }),
      ]);
      const line = new TextDecoder().decode(readiness.value);
      const address = line.match(/listening on (http:\/\/127\.0\.0\.1:\d+)/u)?.[1];
      expect(address).toBeDefined();
      expect(address).not.toMatch(/:0$/u);
      const response = await fetch(`${address}/api/v1/config`);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ mode: "demo" });
    } finally {
      clearTimeout(timeout);
      reader.releaseLock();
      child.kill("SIGTERM");
      await child.exited;
    }
  });

  it("does not report readiness when binding fails", () => {
    const occupied = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
    try {
      const result = run(["serve", "--demo", "--port", String(occupied.port)]);
      expect(result.code).toBe(1);
      expect(result.stderr).not.toContain("listening");
    } finally {
      occupied.stop(true);
    }
  });

  it.each(["not-a-number", "65536", "1.5"])("rejects invalid server port %s", (port) => {
    const result = run(["serve", "--demo", "--port", port]);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      code: "invalid_input",
      issues: [{ path: ["port"] }],
    });
    expect(result.stderr).not.toContain("listening");
  });

  it("rejects malformed serve configuration before readiness", async () => {
    const path = join(tmpdir(), `meeting-finder-invalid-config-${process.pid}.json`);
    await writeFile(path, JSON.stringify({ participants: [{ id: 42 }] }), "utf8");
    try {
      const result = run(["serve", "--demo", "--port", "0", "--config", path]);
      expect(result.code).toBe(1);
      expect(JSON.parse(result.stdout)).toMatchObject({
        code: "invalid_input",
        category: "input",
        issues: [expect.objectContaining({ path: ["participants", 0, "id"] })],
      });
      expect(result.stderr).not.toContain("listening");
    } finally {
      await unlink(path).catch(() => undefined);
    }
  });

  it("rejects proxy origins with an insecure scheme or non-origin URL parts", () => {
    for (const origin of [
      "http://finder.example.ts.net",
      "https://finder.example.ts.net/path",
      "https://user:password@finder.example.ts.net",
      "not-a-url",
    ]) {
      const result = run(["serve", "--demo", "--proxy-origin", origin]);
      expect(result.code).toBe(1);
      expect(JSON.parse(result.stdout).detail).toBe("Invalid proxy origin");
    }
  });
  it("prints human-readable help", () => {
    const result = run(["--help"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("meeting-finder");
    expect(result.stdout).toContain("resolve");
  });

  it("prints the shared schema", () => {
    const result = run(["schema"]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout).properties).toBeDefined();
  });

  it("lists simulated directory sources", () => {
    const result = run(["sources", "spaces", "--demo"]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout).sources.length).toBeGreaterThan(0);
  });

  it("applies required overrides after optional overrides", () => {
    const result = run([
      "resolve",
      "--demo",
      "--required",
      "p2@example.test",
      "--optional",
      "p2@example.test",
    ]);
    expect(result.code).toBe(0);
    const participant = JSON.parse(result.stdout).participants.find(
      (entry: { id: string }) => entry.id === "p2@example.test",
    );
    expect(participant.required).toBe(true);
  });

  it("builds a demo request and resolves it without provider credentials", () => {
    const init = run(["init", "--demo"]);
    expect(init.code).toBe(0);
    expect(JSON.parse(init.stdout).sources).toHaveLength(2);

    const resolved = run(["resolve", "--demo"]);
    expect(resolved.code).toBe(0);
    const body = JSON.parse(resolved.stdout);
    expect(body.mode).toBe("demo");
    expect(body.total).toBe(21);
  });

  it("preserves equals-style override weights and rejects malformed values", () => {
    const valid = run(["resolve", "--demo", "--required=p1@example.test=42"]);
    expect(valid.code).toBe(0);
    expect(
      JSON.parse(valid.stdout).participants.find(
        (entry: { id: string }) => entry.id === "p1@example.test",
      ).weight,
    ).toBe(42);
    for (const option of ["--required=p1@example.test=42=9", "--buffer="]) {
      const invalid = run(["resolve", "--demo", option]);
      expect(invalid.code).toBe(1);
      expect(JSON.parse(invalid.stdout).code).toBe("invalid_input");
    }
  });

  it("accepts a request on stdin and returns a search result", () => {
    const result = run(
      ["search", "--demo", "-"],
      JSON.stringify({
        ...JSON.parse(run(["init", "--demo"]).stdout),
        maxResults: 1,
      }),
    );
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout).mode).toBe("demo");
  });

  it("returns a structured error and exit code one for invalid input", () => {
    const result = run(["resolve", "-"], "{bad json");
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      code: expect.any(String),
      detail: expect.any(String),
      resolution: expect.any(String),
    });
  });

  it("keeps trace diagnostics on stderr and redacts request data", () => {
    const result = run(["resolve", "--demo"], undefined, { MEETING_FINDER_TRACE: "true" });
    expect(result.code).toBe(0);
    expect(result.stdout.trim().split(/\r?\n/u)).toHaveLength(1);
    expect(JSON.parse(result.stdout).mode).toBe("demo");

    const spans = result.stderr
      .trim()
      .split(/\r?\n/u)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(spans.length).toBeGreaterThan(0);
    expect(spans.every((span) => span.type === "meeting-finder.span")).toBe(true);
    expect(spans.every((span) => typeof span.operation === "string")).toBe(true);
    expect(result.stderr).not.toContain("p1@example.test");
    expect(result.stderr).not.toContain("p2@example.test");
    expect(result.stderr).not.toContain("spaces/example");
  });

  it("reports invalid tracing configuration as a structured input error", () => {
    const result = run(["--help"], undefined, { MEETING_FINDER_TRACE: "sometimes" });
    expect(result.code).toBe(1);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      code: "invalid_input",
      category: "input",
      issues: [{ path: ["MEETING_FINDER_TRACE"] }],
    });
  });

  it("preserves nested field paths for invalid attendance rules", () => {
    const result = run(
      ["search", "--demo", "-"],
      JSON.stringify({
        startDate: "2030-01-07",
        endDate: "2030-01-07",
        timeZone: "UTC",
        durationMinutes: 60,
        participants: [
          {
            id: "partial@example.test",
            attendanceRule: { type: "percentage", percent: 0 },
          },
        ],
      }),
    );
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      code: "invalid_input",
      category: "input",
      issues: [{ path: ["participants", 0, "attendanceRule", "percent"] }],
    });
  });

  it("rejects unknown options and oversized UTF-8 input", async () => {
    const unknown = run(["resolve", "--demo", "--wat"]);
    expect(unknown.code).toBe(1);
    expect(JSON.parse(unknown.stdout).code).toBe("invalid_input");

    const oversized = run(["resolve", "-"], "🙂".repeat(40_000));
    expect(oversized.code).toBe(1);
    expect(JSON.parse(oversized.stdout).detail).toContain("128 KiB");

    const path = join(tmpdir(), `meeting-finder-${crypto.randomUUID()}.json`);
    try {
      await Bun.write(
        path,
        JSON.stringify({ participants: [{ id: "a@example.test", name: "🙂".repeat(40_000) }] }),
      );
      const oversizedFile = run(["resolve", path]);
      expect(oversizedFile.code).toBe(1);
      expect(JSON.parse(oversizedFile.stdout).detail).toContain("128 KiB");
    } finally {
      await unlink(path);
    }
  });
});

it("preserves attendance rules in CLI JSON and rejects invalid rules with exit 1", () => {
  const input = {
    startDate: "2030-01-07",
    endDate: "2030-01-07",
    timeZone: "UTC",
    durationMinutes: 60,
    participants: [
      {
        id: "partial@example.test",
        required: true,
        attendanceRule: { type: "percentage", percent: 50 },
      },
    ],
  };
  const result = run(["search", "--demo", "-"], JSON.stringify(input));
  expect(result.code).toBe(0);
  const body = JSON.parse(result.stdout);
  expect(body.audience.participants[0].attendanceRule).toEqual({ type: "percentage", percent: 50 });
  expect(body.candidates[0].participants[0].ruleSatisfied).toBe(true);
  expect(body.candidates[0].participants[0].availableIntervals.length).toBeGreaterThan(0);
  input.participants[0]!.attendanceRule.percent = 0;
  const invalid = run(["search", "--demo", "-"], JSON.stringify(input));
  expect(invalid.code).toBe(1);
  expect(JSON.parse(invalid.stdout).code).toBe("invalid_input");
});
