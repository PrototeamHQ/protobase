import { ChannelRefusal, type Channel } from '@protobase/client'
import type { TypersStore } from './typers-store'
import { typingEvent, type TypingPayload } from './typing'

// A refused send, such as over the channel's rate or while the connection is down, is dropped: typing is short-lived.
const dropRefusal = (error: unknown) => {
  if (error instanceof ChannelRefusal) return
  throw error
}

/**
 * Follows the typing on a record's channel (`client.channel(resource, key)`), named `<resource>/<key>`, into `store`,
 * and sends the reader's: nobody shows as typing while the channel is not joined, as typing cannot be known then, and
 * nothing goes then. `stop` stops following and forgets the typers; the caller leaves the channel.
 */
export const followRecordTyping = (channel: Channel, name: string, store: TypersStore) => {
  // Only a person types: the server's own broadcasts under the same event say nothing of anyone.
  const offTyping = channel.on(typingEvent, (message) => {
    if (message.user !== null && !message.server) store.heard(name, String(message.user), message.payload)
  })
  const offStatus = channel.onStatus((status) => status.state !== 'joined' && store.clear())
  const send = (payload: TypingPayload) => {
    if (channel.status().state !== 'joined') return false
    channel.send(typingEvent, payload).catch(dropRefusal)
    return true
  }
  return {
    send,
    stop: () => {
      offTyping()
      offStatus()
      store.clear()
    },
  }
}
