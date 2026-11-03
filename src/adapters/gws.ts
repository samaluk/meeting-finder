import { Effect, Layer } from "effect";
import { CalendarAvailability, Directory } from "../providers.js";
import { GwsProcessTag } from "./gws-process.js";
import { makeGwsDirectory } from "./gws/directory.js";
import { makeGwsCalendarAvailability } from "./gws/calendar.js";
export const GwsDirectoryLive = Layer.effect(
  Directory,
  Effect.gen(function* () {
    return makeGwsDirectory(yield* GwsProcessTag);
  }),
);
export const GwsCalendarAvailabilityLive = Layer.effect(
  CalendarAvailability,
  Effect.gen(function* () {
    return makeGwsCalendarAvailability(yield* GwsProcessTag);
  }),
);
