import { useEffect } from 'react'
import type { AppAddress } from '@protobase/schema'
import { fillAddress } from '@protobase/schema/internal'
import { Notice } from './meta-gate'
import { useAppAddress } from './use-app-address'
import { text } from './record-messages'

/**
 * The address a record's page opens in its place, its `{{field}}`s filled from the record; none when it would open a
 * record by an empty key, as a field it names is empty, so the record's own page shows instead.
 */
export const openedAddress = (to: AppAddress, record: Record<string, unknown>): AppAddress | undefined => {
  const filled = fillAddress(to, record)
  if (filled.kind !== 'record') return filled
  const parts = Array.isArray(filled.key) ? filled.key : [filled.key]
  return parts.some((part) => part === '') ? undefined : filled
}

/**
 * A record's page that opens another address in its place (`.recordOpens(...)`), as `openedAddress` fills it,
 * replacing this address in the history so Back skips it.
 */
export const RecordOpens = ({ to }: { to: AppAddress }) => {
  const { go } = useAppAddress()
  useEffect(() => go(to, { replace: true }), [to, go])
  return <Notice title={text('loading')}>{text('fetching')}</Notice>
}
