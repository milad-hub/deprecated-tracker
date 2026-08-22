/**
 * Node globals the bundled scanner reaches for, in browser terms.
 *
 * esbuild injects these, so `src/` keeps using the global it always used.
 * `setImmediate` is awaited between files so a scan stays cancellable and the
 * host stays responsive; `setTimeout(0)` is the browser equivalent, and inside a
 * Web Worker it is also what lets a cancel message be delivered mid-scan.
 */
export function setImmediate<TArgs extends unknown[]>(
  callback: (...args: TArgs) => void,
  ...args: TArgs
): ReturnType<typeof setTimeout> {
  return setTimeout(() => callback(...args), 0);
}
