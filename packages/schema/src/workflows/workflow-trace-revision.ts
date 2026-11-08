/**
 * The revision of a run's trace's first steps: a SHA-256 of them, in hex, which changes when any of them does, as when
 * a part kept by a worker whose clock is behind sorts before parts read already. A trace read gives the revision of the
 * steps it holds, and the next read after them sends it back, so the server answers the whole trace again when the
 * steps the reader has are no longer the trace's first.
 */
export const workflowTraceRevision = async (steps: readonly unknown[]) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(steps)))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
