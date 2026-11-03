import { describe, expect, it } from "vitest";
import { participantsFor, simulate } from "../site/simulation.js";

describe("public simulated demo through MeetingFinder.search", () => {
  it("labels everyone-required alternatives as blocked", async () => {
    const result = await simulate(participantsFor("required"));
    expect(result.candidates).toEqual([]);
    expect(result.blockedAlternatives.length).toBeGreaterThan(0);
    expect(
      result.blockedAlternatives.every((candidate) => candidate.requiredConflicts.length > 0),
    ).toBe(true);
  });
  it("offers valid times with optional absences and honest coverage", async () => {
    const result = await simulate(participantsFor("optional"));
    expect(result.candidates[0]).toMatchObject({
      start: "2030-01-07T13:00:00Z",
      availableWeight: 6,
      totalWeight: 14,
      requiredConflicts: [],
    });
    expect(result.candidates[0]?.score).toBe(42.9);
  });
  it("counts anchored commitments but rejects fragmented and unknown availability", async () => {
    const result = await simulate(participantsFor("partial"));
    const candidate = result.candidates[0];
    expect(candidate).toMatchObject({
      start: "2030-01-07T13:00:00Z",
      availableWeight: 12,
      totalWeight: 14,
    });
    expect(
      candidate?.participants.find((p) => p.participantId === "casey@example.test")?.ruleSatisfied,
    ).toBe(true);
    expect(
      candidate?.participants.find((p) => p.participantId === "devon@example.test")?.ruleSatisfied,
    ).toBe(true);
    expect(
      candidate?.participants.find((p) => p.participantId === "ellis@example.test"),
    ).toMatchObject({ ruleSatisfied: false, longestAvailableMinutes: 15 });
    expect(
      candidate?.participants.find((p) => p.participantId === "finley@example.test"),
    ).toMatchObject({ state: "unknown", ruleSatisfied: false });
  });
});
