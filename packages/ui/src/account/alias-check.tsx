import { useEffect } from 'react'
import type { AliasCheckCalls } from './alias-check-run'
import { AliasCheckPanel } from './alias-check-panel'
import { useAliasCheck } from './use-alias-check'

/** How a dialog checks its address: whether the app can, and for an address entered, its calls and whether the check starts at once. */
export type AliasCheckProps = { available: boolean; calls?: AliasCheckCalls; auto?: boolean }

/** The check of `address` in its dialog, which stops when the dialog closes; `onConfirmed` hears when it confirms the address. */
export const AliasCheck = ({ address, calls, auto = false, onConfirmed }: { address: string; calls: AliasCheckCalls; auto?: boolean; onConfirmed?: () => void }) => {
  const { state, error, check } = useAliasCheck(calls, auto)
  const confirmed = state.status === 'confirmed'
  useEffect(() => {
    if (confirmed) onConfirmed?.()
  }, [confirmed, onConfirmed])
  return <AliasCheckPanel address={address} state={state} error={error} onCheck={() => void check()} />
}
