import type { MobileReleaseAnswer } from '@protobase/schema/internal'

/** What the app does with the server's answer: nothing, or download its release and set it next. */
export type Swap = { kind: 'none' } | { kind: 'take'; bundleId: string }

export type SwapInput = {
  /** The server's answer; `undefined` when it gave none. */
  answer: MobileReleaseAnswer | undefined
  /** The downloaded bundle the app runs and the one it runs at its next start, null for its own files. */
  current: string | null
  next: string | null
}

/**
 * The live updater's rules. A release the app does not run is downloaded and set as the next bundle, which it runs at
 * its next cold start. A required release is skipped: the server builds every release for its own shell version, and a
 * required one means the app's shell has another, so the binary's guard refuses it. A release it runs or runs next, no
 * release, or no answer changes nothing: the answer is not signed, so it never takes the app back to its own files,
 * which only a release that fails to start does.
 */
export const swapDecision = ({ answer, current, next }: SwapInput): Swap => {
  if (!answer?.bundleId || answer.required) return { kind: 'none' }
  if (answer.bundleId === current || answer.bundleId === next) return { kind: 'none' }
  return { kind: 'take', bundleId: answer.bundleId }
}
