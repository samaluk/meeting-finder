import type { ParticipantInput } from "../src/domain/participant.js";
import type { SearchResult } from "../src/domain/search.js";
import { demoBusy, demoDate, demoPeople, participantsFor, simulate } from "./simulation.js";

const element = <T extends HTMLElement>(id: string) => {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing landing page element: ${id}`);
  return found as T;
};
const people = element("people");
const summary = element("summary");
const candidates = element("candidates");
let participants = participantsFor("partial");
let latestResult: SearchResult | undefined;
let selected = 0;
let revision = 0;
const time = (value: string) =>
  new Date(value).toLocaleTimeString("en-GB", {
    timeZone: "UTC",
    hour: "2-digit",
    minute: "2-digit",
  });
const rules = [
  ["full", "Whole meeting"],
  ["start", "First 15 min"],
  ["end", "Last 15 min"],
  ["percentage", "50% continuous"],
];
people.innerHTML = demoPeople
  .map(
    (person, index) => `
  <article class="person-row" data-person="${index}">
    <div class="person-policy"><div class="person-name"><label><input type="checkbox" data-required="${index}" aria-label="${person.name} is required" /><strong>${person.name}</strong></label><label class="weight"><span aria-hidden="true">×</span><span class="sr-only">${person.name}'s weight</span><input type="number" min="1" max="10" step="1" data-weight="${index}" value="${person.weight}" /></label></div><label class="rule-select"><span class="sr-only">${person.name}'s attendance rule</span><select data-rule="${index}">${rules.map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select></label></div>
    <div class="person-evidence"><p class="sr-only calendar-description"></p><div class="slots" aria-hidden="true">${Array.from({ length: 12 }, (_, slot) => `<span class="slot" data-slot="${slot}"></span>`).join("")}</div><p class="observation"></p></div>
  </article>`,
  )
  .join("");
const visibleOptions = () =>
  latestResult
    ? latestResult.candidates.length > 0
      ? latestResult.candidates
      : latestResult.blockedAlternatives
    : [];
const paint = () => {
  if (!latestResult) return;
  const options = visibleOptions();
  const candidate = options[selected];
  const focusedCandidate =
    document.activeElement instanceof HTMLButtonElement
      ? document.activeElement.dataset.candidate
      : undefined;
  for (const [index, person] of participants.entries()) {
    const row = people.querySelector<HTMLElement>(`[data-person="${index}"]`)!;
    row.querySelector<HTMLInputElement>("[data-required]")!.checked = person.required ?? false;
    row.querySelector<HTMLInputElement>("[data-weight]")!.value = String(person.weight);
    row.querySelector<HTMLSelectElement>("[data-rule]")!.value =
      person.attendanceRule?.type ?? "full";
    const observation = candidate?.participants.find((entry) => entry.participantId === person.id);
    const evidence = row.querySelector<HTMLElement>(".observation")!;
    const satisfied = observation?.ruleSatisfied ?? false;
    evidence.dataset.satisfied = String(satisfied);
    evidence.textContent = !observation
      ? "No interval satisfies a participant rule."
      : person.id === "finley@example.test"
        ? "? Calendar unknown · never counted"
        : `${satisfied ? "✓" : "✕"} ${satisfied ? "Rule met" : "Rule not met"} · longest free block ${Math.round(observation.longestAvailableMinutes)} min${observation.state === "busy" ? " · known conflict" : ""}`;
    const busy = demoBusy[person.id as keyof typeof demoBusy] ?? [];
    row.querySelector<HTMLElement>(".calendar-description")!.textContent =
      person.id === "finley@example.test"
        ? "Calendar unknown throughout 13:00–16:00 UTC."
        : `Calendar 13:00–16:00 UTC. ${busy.length === 0 ? "Free throughout." : `Busy ${busy.map((interval) => `${time(interval.start)}–${time(interval.end)}`).join(", ")}; free otherwise.`}`;
    const from = candidate ? Date.parse(candidate.start) : 0;
    const to = candidate ? Date.parse(candidate.end) : 0;
    for (const cell of row.querySelectorAll<HTMLElement>("[data-slot]")) {
      const slot = Number(cell.dataset.slot);
      const start = Date.parse(`${demoDate}T13:00:00Z`) + slot * 15 * 60_000;
      const end = start + 15 * 60_000;
      const state =
        person.id === "finley@example.test"
          ? "unknown"
          : busy.some(
                (interval) => Date.parse(interval.start) < end && Date.parse(interval.end) > start,
              )
            ? "busy"
            : "free";
      cell.dataset.state = state;
      cell.dataset.window = String(start < to && end > from);
      cell.classList.toggle("meeting-start", start === from);
      cell.classList.toggle("meeting-end", end === to);
    }
  }
  const valid = latestResult.candidates.length > 0;
  summary.innerHTML = candidate
    ? `
    <p class="score">${candidate.availableWeight}<span> / ${candidate.totalWeight}</span></p>
    <p class="coverage">${Math.round(candidate.score * 10) / 10}% weighted coverage</p>
    <p class="decision" data-valid="${valid}">${valid ? "✓ A time that works" : "✕ Blocked alternative"}</p>
    <dl><div><dt>Attendance rules met</dt><dd>${candidate.attendance} / ${participants.length}</dd></div><div><dt>Required conflicts</dt><dd>${candidate.requiredConflicts.length}</dd></div><div><dt>Calendar unknown</dt><dd>1</dd></div></dl>
  `
    : '<p class="decision" data-valid="false">No matching intervals</p><p>Try adjusting who is required or an attendance rule.</p>';
  candidates.innerHTML = `<p class="eyebrow">${valid ? "RANKED OPTIONS" : "REVIEW ONLY · BLOCKED"}</p>${options.map((option, index) => `<button data-candidate="${index}" aria-pressed="${index === selected}"><span>${time(option.start)}—${time(option.end)}</span><span>${Math.round(option.score)}% <span aria-hidden="true">↗</span></span></button>`).join("")}${candidate && !valid ? '<p class="blocked-note">Required conflicts: <span id="conflicts"></span>. This is not a valid proposal.</p>' : ""}`;
  if (focusedCandidate !== undefined)
    candidates
      .querySelector<HTMLButtonElement>(`[data-candidate="${focusedCandidate}"]`)
      ?.focus({ preventScroll: true });
  const conflicts = document.getElementById("conflicts");
  if (conflicts && candidate)
    conflicts.textContent = candidate.requiredConflicts
      .map((id) => demoPeople.find((p) => p.id === id)?.name ?? id)
      .join(", ");
};
const refresh = async () => {
  const current = ++revision;
  try {
    const result = await simulate(participants);
    if (current !== revision) return;
    latestResult = result;
    selected = 0;
    paint();
  } catch {
    if (current === revision)
      summary.textContent = "The simulated search could not run. Reset a scenario to try again.";
  }
};
const updateParticipant = (index: number, patch: Partial<ParticipantInput>) => {
  participants = participants.map((person, i) => (i === index ? { ...person, ...patch } : person));
  document
    .querySelectorAll<HTMLButtonElement>("[data-preset]")
    .forEach((button) => button.setAttribute("aria-pressed", "false"));
  void refresh();
};
people.addEventListener("change", (event) => {
  const target = event.target;
  if (target instanceof HTMLInputElement && target.dataset.required !== undefined)
    updateParticipant(Number(target.dataset.required), { required: target.checked });
  if (target instanceof HTMLInputElement && target.dataset.weight !== undefined) {
    const weight = Number(target.value);
    if (!Number.isInteger(weight) || weight < 1 || weight > 10) {
      target.value = String(participants[Number(target.dataset.weight)]?.weight ?? 1);
      return;
    }
    updateParticipant(Number(target.dataset.weight), { weight });
  }
  if (target instanceof HTMLSelectElement && target.dataset.rule !== undefined) {
    const value = target.value;
    const attendanceRule =
      value === "start" || value === "end"
        ? ({ type: value, minutes: 15 } as const)
        : value === "percentage"
          ? ({ type: "percentage", percent: 50 } as const)
          : ({ type: "full" } as const);
    updateParticipant(Number(target.dataset.rule), { attendanceRule });
  }
});
document.querySelectorAll<HTMLButtonElement>("[data-preset]").forEach((button) =>
  button.addEventListener("click", () => {
    const preset = button.dataset.preset;
    if (preset !== "required" && preset !== "optional" && preset !== "partial") return;
    participants = participantsFor(preset);
    document
      .querySelectorAll<HTMLButtonElement>("[data-preset]")
      .forEach((other) => other.setAttribute("aria-pressed", String(other === button)));
    void refresh();
  }),
);
candidates.addEventListener("click", (event) => {
  const target =
    event.target instanceof Element
      ? event.target.closest<HTMLButtonElement>("[data-candidate]")
      : null;
  if (!target) return;
  selected = Number(target.dataset.candidate);
  paint();
});
element("copy-install").addEventListener("click", () => {
  Promise.resolve()
    .then(() => navigator.clipboard.writeText(element("install-commands").textContent ?? ""))
    .then(
      () => {
        element("copy-status").textContent = "Commands copied.";
      },
      () => {
        element("copy-status").textContent = "Select the commands above to copy them manually.";
      },
    );
});
void refresh();
