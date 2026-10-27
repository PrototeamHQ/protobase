import type { Caller } from '../api-keys/resolve-caller'
import { isDatabaseError } from '../error-handler'
import type { ChannelAccess, Extension } from './channel-access'

/** Why a channel may not read its topic: it never could, or its new token took away what the old one allowed. */
export type ReadRefusal = 'denied' | 'revoked'

/**
 * What a joined channel may do. `authorize` checks the caller, at the join and at each new token, and refuses a channel
 * that may read nothing; `hears` says whether it receives an extension's messages, and `mayWrite` whether it may send
 * them.
 */
export type ChannelGate = {
  authorize: (caller: Caller) => Promise<ReadRefusal | undefined>
  hears: (extension: Extension) => boolean
  mayWrite: (caller: Caller, extension: Extension) => Promise<boolean>
}

/** A public channel, which may do anything. */
export const publicGate: ChannelGate = {
  authorize: async () => undefined,
  hears: () => true,
  mayWrite: async () => true,
}

/** Supabase's message for a refusal to read the topic, which it names without its `realtime:` prefix. */
export const readRefusalText = (topic: string, refusal: ReadRefusal) =>
  refusal === 'revoked' ? `You no longer have permission to read from this Channel topic: ${subTopic(topic)}` : `You do not have permissions to read from this Channel topic: ${subTopic(topic)}`

const subTopic = (topic: string) => topic.replace(/^realtime:/, '')

/**
 * A private channel, as Supabase Realtime Authorization checks one: its reads of broadcasts, and of presence when it
 * listens to presence, are checked by `authorize`, and each write the first time the channel sends it after that, and
 * kept until its next token. A policy that fails, such as one calling a function that raises, allows nothing, and its
 * error goes to `report`.
 */
export const privateGate = (access: ChannelAccess, topic: string, presence: boolean, report: (error: unknown) => void): ChannelGate => {
  let reads = new Map<Extension, boolean>()
  let writes = new Map<Extension, boolean>()

  const denied = <T>(nothing: T) => (error: unknown) => {
    if (!isDatabaseError(error)) throw error
    report(error)
    return nothing
  }

  return {
    authorize: async (caller) => {
      const before = reads
      reads = await access.read(caller, subTopic(topic), presence ? ['broadcast', 'presence'] : ['broadcast']).catch(denied(new Map<Extension, boolean>()))
      writes = new Map()
      if (![...reads.values()].some(Boolean)) return 'denied'
      if ([...before].some(([extension, allowed]) => allowed && !reads.get(extension))) return 'revoked'
      return undefined
    },
    hears: (extension) => reads.get(extension) === true,
    mayWrite: async (caller, extension) => {
      const known = writes.get(extension)
      if (known !== undefined) return known
      // A failed check is not kept, so the next send checks again.
      return access.write(caller, subTopic(topic), extension).then((allowed) => {
        writes.set(extension, allowed)
        return allowed
      }, denied(false))
    },
  }
}
