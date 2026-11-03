import { Data, Effect, Stream } from "effect";

export class ByteLimitExceeded extends Data.TaggedError("ByteLimitExceeded")<{
  readonly limit: number;
}> {}

/** Bound actual bytes before retaining them; keep stream failures and interruption intact. */
export const readBoundedText = <E, R>(
  stream: Stream.Stream<Uint8Array, E, R>,
  limit: number,
): Effect.Effect<string, E | ByteLimitExceeded, R> =>
  Stream.runFoldEffect(
    stream,
    (): { chunks: Uint8Array[]; size: number } => ({ chunks: [], size: 0 }),
    (state, chunk) =>
      state.size + chunk.byteLength > limit
        ? Effect.fail(new ByteLimitExceeded({ limit }))
        : Effect.sync(() => {
            state.chunks.push(chunk);
            state.size += chunk.byteLength;
            return state;
          }),
  ).pipe(
    Effect.map(({ chunks, size }) => {
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return new TextDecoder().decode(bytes);
    }),
  );
