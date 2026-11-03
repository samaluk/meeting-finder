import { Data, Effect, Schema, type Stream } from "effect";
import { readBoundedText } from "./bounded-stream.js";

export const MAX_INPUT_BYTES = 128 * 1024;

export class InvalidJson extends Data.TaggedError("InvalidJson") {}

/** Shared CLI/HTTP JSON framing; domain decoding remains at MeetingFinder. */
export const readJsonInput = <E, R>(stream: Stream.Stream<Uint8Array, E, R>) =>
  readBoundedText(stream, MAX_INPUT_BYTES).pipe(
    Effect.flatMap((content) =>
      Schema.decodeEffect(Schema.fromJsonString(Schema.Unknown))(content).pipe(
        Effect.mapError(() => new InvalidJson()),
      ),
    ),
  );
