import type { MobileReleaseAnswer } from '@protobase/schema/internal'

/** What the app does with the server's answer: nothing, or take its release, downloading it unless it has it. */
export type Swap = { kind: 'none' } | { kind: 'take'; bundleId: string; download: boolean; reload: boolean }

export type SwapInput = {
  /** The server's answer; `undefined` when it gave none. */
  answer: MobileReleaseAnswer | undefined
  /** The downloaded bundle the app runs and the one it runs at its next start, null for its own files. */
  current: string | null
  next: string | null
  /** Whether this is the check at launch, the only one that may hold the app for a required update. */
  launch: boolean
}

/**
 * The live updater's rules. A release the app does not run is downloaded and set as the next bundle, which it runs at
 * its next cold start; at launch, a required one is also reloaded into at once. A release it runs, no release, or no
 * answer changes nothing: the answer is not signed, so it never takes the app back to its own files, which only a
 * release that fails to start does.
 */
export const swapDecision = ({ answer, current, next, launch }: SwapInput): Swap => {
  if (!answer?.bundleId || answer.bundleId === current) return { kind: 'none' }
  const reload = launch && answer.required
  if (answer.bundleId === next && !reload) return { kind: 'none' }
  return { kind: 'take', bundleId: answer.bundleId, download: answer.bundleId !== next, reload }
}
