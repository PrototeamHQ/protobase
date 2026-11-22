import { Button } from '../primitives/button'
import type { AliasCheckState } from './alias-check-run'
import { SectionError, SectionNotice } from './account-section'
import { text } from './messages'

/** Said where the app cannot check addresses, such as one not hosted where the test messages are received. */
export const AliasCheckUnavailable = () => (
  <div className="mt-4">
    <SectionNotice message={text('checkUnavailable')} />
  </div>
)

type AliasCheckPanelProps = { address: string; state: AliasCheckState; error?: string; onCheck: () => void }

const outcome = (address: string, state: AliasCheckState) => {
  if (state.status === 'waiting') return <SectionNotice message={text('checkWaiting', { address })} />
  if (state.status === 'confirmed') return <SectionNotice message={text('checkConfirmed', { address })} />
  if (state.status === 'mismatch') return <SectionError message={text('checkMismatch', { address, from: state.from })} />
  if (state.status === 'timed_out') return <SectionNotice message={text('checkTimedOut')} />
  return null
}

/** Whether mail from a From address really goes out from it: the check's button and where it stands. */
export const AliasCheckPanel = ({ address, state, error, onCheck }: AliasCheckPanelProps) => {
  if (state.status === 'unchecked') return <AliasCheckUnavailable />
  const waiting = state.status === 'waiting'
  return (
    <div className="mt-4">
      {outcome(address, state)}
      <SectionError message={error} />
      <Button size="sm" loading={waiting} onClick={onCheck}>
        {state.status === 'idle' || waiting ? text('checkFromAddress') : text('checkAgain')}
      </Button>
    </div>
  )
}
