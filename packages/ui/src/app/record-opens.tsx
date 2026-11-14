import { useEffect } from 'react'
import type { AppAddress } from '@protobase/schema'
import { fillAddress } from '@protobase/schema/internal'
import { Notice } from './meta-gate'
import { useAppAddress } from './use-app-address'
import { text } from './record-messages'

/**
 * A record's page that opens another address in its place (`.recordOpens(...)`), its `{{field}}`s filled from the
 * record, replacing this address in the history so Back skips it.
 */
export const RecordOpens = ({ to, record }: { to: AppAddress; record: Record<string, unknown> }) => {
  const { go } = useAppAddress()
  useEffect(() => go(fillAddress(to, record), { replace: true }), [to, record, go])
  return <Notice title={text('loading')}>{text('fetching')}</Notice>
}
