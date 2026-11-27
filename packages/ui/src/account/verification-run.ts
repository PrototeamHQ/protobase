import type { MailSenderVerification } from '@protobase/client'

/** How often a verification asks whether it settled, and how long it asks before it stops. */
export const verifyInterval = 3000
export const verifyDeadline = 120_000

/** Where a verification of a From address stands on screen: not run yet, running, settled with each verifier's latest, or still pending at its deadline. */
export type VerificationState = { status: 'idle' } | { status: 'pending' } | { status: 'settled'; verifications: MailSenderVerification[] } | { status: 'timed_out' }

export type VerificationCalls = {
  /** Starts the app's verifiers on the address, answering its latest verifications. */
  start: () => Promise<MailSenderVerification[]>
  /** The address's latest verifications, read again. */
  read: () => Promise<MailSenderVerification[]>
}

type Run = VerificationCalls & {
  wait: (ms: number) => Promise<void>
  /** The clock its deadline is read from, in milliseconds. */
  now: () => number
  /** Whether the verification was left, such as by closing its dialog: it then asks nothing more and reports nothing. */
  stopped: () => boolean
  onState: (state: VerificationState) => void
}

const pending = (verifications: MailSenderVerification[]) => verifications.some(({ state }) => state === 'pending')

// What a request answers after the deadline, or not at all before it.
const late = Symbol('late')

/**
 * Runs one verification: starts it, then reads it again every `verifyInterval` while any verifier's is pending, until
 * `verifyDeadline` has passed, and reports each state it reaches. Each request gets the time left at most, and an answer
 * or failure after the deadline counts as none. Rejects as `start` or `read` reject before it.
 */
export const runVerification = async ({ start, read, wait, now, stopped, onState }: Run) => {
  const deadline = now() + verifyDeadline
  const inTime = async (request: () => Promise<MailSenderVerification[]>) => {
    const left = deadline - now()
    if (left <= 0) return late
    const answer = await Promise.race([request(), wait(left).then((): typeof late => late)]).catch((error: unknown): typeof late => {
      if (now() < deadline) throw error
      return late
    })
    return now() < deadline ? answer : late
  }

  onState({ status: 'pending' })
  let verifications = await inTime(start)
  while (verifications !== late && pending(verifications)) {
    if (stopped()) return
    await wait(Math.min(verifyInterval, deadline - now()))
    if (stopped()) return
    verifications = await inTime(read)
  }
  if (stopped()) return
  if (verifications === late) return onState({ status: 'timed_out' })
  onState({ status: 'settled', verifications })
}
