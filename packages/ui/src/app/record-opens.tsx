import { useEffect } from 'react'
import type { AppAddress } from '@protobase/schema'
import { Notice } from './meta-gate'
import { useAppAddress } from './use-app-address'
import { text } from './record-messages'

/**
 * A record's page that opens another address in its place (`.recordOpens(...)`), as `openedAddress` picks and fills it,
 * replacing this address in the history so Back skips it.
 */
export const RecordOpens = ({ to }: { to: AppAddress }) => {
  const { go } = useAppAddress()
  useEffect(() => go(to, { replace: true }), [to, go])
  return <Notice title={text('loading')}>{text('fetching')}</Notice>
}
