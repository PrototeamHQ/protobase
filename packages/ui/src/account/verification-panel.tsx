import type { MailSenderVerification } from '@protobase/client'
import { Button } from '../primitives/button'
import { SectionError, SectionNotice } from './account-section'
import type { VerificationState } from './verification-run'
import { text } from './messages'

/** Said where the app has no verifier of From addresses. */
export const VerificationUnavailable = () => (
  <div className="mt-4">
    <SectionNotice message={text('verifyUnavailable')} />
  </div>
)

type VerificationPanelProps = { address: string; state: VerificationState; error?: string; onVerify: () => void }

// The app's own codes have words of their own; any other is the verifier's, whose own text, if any, follows as plain text.
const failureMessage = (address: string, { errorCode }: MailSenderVerification) => {
  if (errorCode === 'verification_expired') return text('verifyExpired', { address })
  if (errorCode === 'verifier_error') return text('verifierError', { address })
  return text('verifyFailed', { address })
}

const settled = (address: string, verifications: MailSenderVerification[]) => {
  if (verifications.some(({ state }) => state === 'verified')) return <SectionNotice message={text('verifyVerified', { address })} />
  const failed = verifications.find(({ state }) => state === 'failed')
  if (!failed) return null
  return (
    <>
      <SectionError message={failureMessage(address, failed)} />
      {failed.error && <p className="mb-3 whitespace-pre-line text-muted-foreground">{failed.error}</p>}
    </>
  )
}

const outcome = (address: string, state: VerificationState) => {
  if (state.status === 'pending') return <SectionNotice message={text('verifyPending', { address })} />
  if (state.status === 'settled') return settled(address, state.verifications)
  if (state.status === 'timed_out') return <SectionNotice message={text('verifyTimedOut')} />
  return null
}

/** Whether mail from a From address really goes out from it: the verification's button and where it stands. */
export const VerificationPanel = ({ address, state, error, onVerify }: VerificationPanelProps) => {
  const pending = state.status === 'pending'
  return (
    <div className="mt-4">
      {outcome(address, state)}
      <SectionError message={error} />
      <Button size="sm" loading={pending} onClick={onVerify}>
        {state.status === 'idle' || pending ? text('verifyFromAddress') : text('verifyAgain')}
      </Button>
    </div>
  )
}
