import type { RequestInput } from "../src/domain/request.js";
import type { Model } from "./model.js";
export const rulesOf = (model: Model) => ({
  startDate: model.startDate,
  endDate: model.endDate,
  timeZone: model.timeZone,
  durationMinutes: model.duration,
  stepMinutes: model.step,
  bufferMinutes: model.buffer,
  minAttendance: model.minimum,
  maxResults: model.maxResults,
});
export const participantInputOf = (model: Model) =>
  model.people.map(({ memberships: _memberships, ...participant }) => participant);
export const resolveRequestOf = (model: Model) =>
  model.sources.length > 0
    ? {
        ...rulesOf(model),
        sources: model.sources,
        overrides: model.overrides,
        participantDefaults: model.participantDefaults,
        groupAliases: model.groupAliases,
      }
    : { ...rulesOf(model), participants: participantInputOf(model), overrides: model.overrides };
export const searchRequestOf = (model: Model) => ({
  ...rulesOf(model),
  participants: participantInputOf(model),
});

export const meetingFieldsOf = (model: Model, config: RequestInput) => ({
  startDate: config.startDate ?? model.startDate,
  endDate: config.endDate ?? model.endDate,
  timeZone: config.timeZone ?? model.timeZone,
  duration: config.durationMinutes ?? model.duration,
  step: config.stepMinutes ?? model.step,
  buffer: config.bufferMinutes ?? model.buffer,
  minimum: config.minAttendance ?? model.minimum,
  maxResults: config.maxResults ?? model.maxResults,
});
