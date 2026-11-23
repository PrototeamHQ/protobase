import type { MailSenderVerification } from '@protobase/client'

/** How often a verification asks whether it settled, and how many times before it stops asking: 2 minutes. */
export const verifyInterval = 3000
export const verifyAttempts = 40

/** Where a verification of a From address stands on screen: not run yet, running, settled with each verifier's latest, or still pending after the last attempt. */
export type VerificationState = { status: 'idle' } | { status: 'pending' } | { status: 'settled'; verifications: MailSenderVerification[] } | { status: 'timed_out' }

export type VerificationCalls = {
  /** Starts the app's verifiers on the address, answering its latest verifications. */
  start: () => Promise<MailSenderVerification[]>
  /** The address's latest verifications, read again. */
  read: () => Promise<MailSenderVerification[]>
}

type Run = VerificationCalls & {
  wait: (ms: number) => Promise<void>
  /** Whether the verification was left, such as by closing its dialog: it then asks nothing more and reports nothing. */
  stopped: () => boolean
  onState: (state: VerificationState) => void
}

const pending = (verifications: MailSenderVerification[]) => verifications.some(({ state }) => state === 'pending')

/**
 * Runs one verification: starts it, then reads it again every `verifyInterval` while any verifier's is pending, at
 * most `verifyAttempts` times, and reports each state it reaches. Rejects as `start` or `read` reject.
 */
export const runVerification = async ({ start, read, wait, stopped, onState }: Run) => {
  onState({ status: 'pending' })
  let verifications = await start()
  for (let attempt = 0; pending(verifications); attempt++) {
    if (stopped()) return
    if (attempt === verifyAttempts) return onState({ status: 'timed_out' })
    await wait(verifyInterval)
    if (stopped()) return
    verifications = await read()
  }
  if (stopped()) return
  onState({ status: 'settled', verifications })
}
