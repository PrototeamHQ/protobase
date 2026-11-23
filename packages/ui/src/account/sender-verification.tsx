import type { VerificationCalls } from './verification-run'
import { VerificationPanel } from './verification-panel'
import { useSenderVerification } from './use-sender-verification'

/** How a dialog verifies its address: whether the app can, and for an address entered, its calls and whether it starts at once. */
export type SenderVerificationProps = { available: boolean; calls?: VerificationCalls; auto?: boolean }

/** The verification of `address` in its dialog, which stops asking when the dialog closes. */
export const SenderVerification = ({ address, calls, auto = false }: { address: string; calls: VerificationCalls; auto?: boolean }) => {
  const { state, error, verify } = useSenderVerification(calls, auto)
  return <VerificationPanel address={address} state={state} error={error} onVerify={() => void verify()} />
}
