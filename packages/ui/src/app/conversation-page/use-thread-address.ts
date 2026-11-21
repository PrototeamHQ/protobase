import type { AppAddress } from '@protobase/schema'
import { useAppAddress } from '../use-app-address'

/**
 * The thread a conversation page shows beside it, as its address holds it (`?thread=`): `open`, the key of the
 * thread's first message, none while no thread is open; `to`, the address that opens a message's thread, for a link;
 * and `close`, which goes back to the conversation alone. Both keep the record's call the page joins (`?call=join`).
 */
export const useThreadAddress = (resource: string, key: string) => {
  const { address, go } = useAppAddress()
  const here = address?.kind === 'record' && address.resource === resource && address.key === key ? address : undefined
  const call = here?.call && { call: here.call }
  const to = (message: string): AppAddress => ({ kind: 'record', resource, key, ...call, thread: message })
  const close = () => go({ kind: 'record', resource, key, ...call })
  return { open: here?.thread, to, close }
}
