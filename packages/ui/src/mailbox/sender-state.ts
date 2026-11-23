import type { MailSenderState } from '@protobase/client'
import type { BadgeTone } from '../primitives/badge'
import { text } from './messages'

const labels = {
  verified: 'stateVerified',
  pending: 'statePending',
  unverified: 'stateUnverified',
  failed: 'stateFailed',
  detached: 'stateDetached',
} as const satisfies Record<MailSenderState, string>

// Green and grey go out; amber and red do not.
const tones: Record<MailSenderState, BadgeTone> = { verified: 'green', pending: 'amber', unverified: 'neutral', failed: 'red', detached: 'red' }

/** A From address's state as a badge shows it: its label and its tone. */
export const senderState = (state: MailSenderState) => ({ label: text(labels[state]), tone: tones[state] })

/** Whether mail can go out from an address in `state`: a failed, pending or detached one is refused. */
export const canSendFrom = (state: MailSenderState) => state === 'verified' || state === 'unverified'
