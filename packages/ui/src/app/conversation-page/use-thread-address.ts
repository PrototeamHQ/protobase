import type { AppAddress } from '@protobase/schema'
import { useAppAddress } from '../use-app-address'

/**
 * The thread a conversation page shows beside it, as its address holds it (`?thread=`): `open`, the key of the
 * thread's first message, none while no thread is open; `to`, the address that opens a message's thread, for a link;
 * and `close`, which goes back to the conversation alone.
 */
export const useThreadAddress = (resource: string, key: string) => {
  const { address, go } = useAppAddress()
  const open = address?.kind === 'record' && address.resource === resource && address.key === key ? address.thread : undefined
  const to = (message: string): AppAddress => ({ kind: 'record', resource, key, thread: message })
  const close = () => go({ kind: 'record', resource, key })
  return { open, to, close }
}
