/** Wraps an async loader so concurrent callers share one in-flight call instead of starting their own. */
export function shareInFlight<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined;
  return () => (pending ??= load().finally(() => (pending = undefined)));
}
