import type { MailSenderCheck } from '@protobase/client'

/** How often a check asks whether its test message arrived, and how many times before it gives up: 2 minutes. */
export const checkInterval = 3000
export const checkAttempts = 40

/** Where a check of a From address stands on screen: not run yet, its message on its way, or how it ended. */
export type AliasCheckState = { status: 'idle' } | { status: 'waiting' } | { status: 'confirmed'; from: string } | { status: 'mismatch'; from: string } | { status: 'timed_out' } | { status: 'unchecked' }

export type AliasCheckCalls = {
  start: () => Promise<MailSenderCheck>
  result: (check: string) => Promise<MailSenderCheck>
}

type Run = AliasCheckCalls & {
  wait: (ms: number) => Promise<void>
  /** Whether the check was left, such as by closing its dialog: it then asks nothing more and reports nothing. */
  stopped: () => boolean
  onState: (state: AliasCheckState) => void
}

/**
 * Runs one check: sends its test message, then asks every `checkInterval` whether it arrived, at most `checkAttempts`
 * times, and reports each state it reaches. Rejects as `start` or `result` reject.
 */
export const runAliasCheck = async ({ start, result, wait, stopped, onState }: Run) => {
  onState({ status: 'waiting' })
  const started = await start()
  if (stopped()) return
  if (started.status !== 'waiting') return onState(started)
  for (let attempt = 0; attempt < checkAttempts; attempt++) {
    await wait(checkInterval)
    if (stopped()) return
    const answer = await result(started.check)
    if (stopped()) return
    if (answer.status !== 'waiting') return onState(answer)
  }
  onState({ status: 'timed_out' })
}
