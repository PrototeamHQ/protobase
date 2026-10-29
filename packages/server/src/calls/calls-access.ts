import { anonymousUserId } from '../anonymous'
import type { SocketEvents } from '../functions/function-socket'
import { forbidden } from '../problem'
import type { Session } from '../types'
import type { CallMember, CallRecordKey } from './call-member'
import { checkRing } from './call-ring'
import type { CallItem } from './call-reads'
import type { CallsService } from './calls-service-type'

/** What a function admits members to calls with, and sees and changes them by. */
export type CallsAccess = {
  /**
   * The member's media session in the call on the record, as the events of the socket the function accepts for them:
   * return `acceptWebSocket(await calls.join(member))` once the function decided the caller may join. The caller must
   * be signed in and able to read the record, now and at every minute's check; the browser's `joinCall` from
   * `@protobase/client/calls` speaks to it. Rejects when the app has no `calls` configured.
   */
  join: (member: CallMember) => Promise<SocketEvents>
  /**
   * Takes the member out of the call `call` at once, and keeps them out of it: their sockets close, the others drop
   * their connections to them, and their joins and resumes are refused. Whether they were in it; nothing happens to a
   * call that ended.
   */
  remove: (call: string, member: string) => Promise<boolean>
  /** The record's latest calls, newest first, the one going on first: with no access check, like `db`. */
  of: (record: { resource: string; key: CallRecordKey }) => Promise<CallItem[]>
}

/** The caller of a function, as calls need them: who they are, and whether they read a record. */
type CallsCaller = { session: Session; records: { get: (resource: string, key: CallRecordKey) => Promise<unknown> } }

/** The largest message of a member's socket: a description, with room to spare. */
const maxMessageBytes = 300 * 1024

const checkMember = ({ record, member }: CallMember) => {
  if (typeof record?.resource !== 'string' || record.resource.length === 0) throw new TypeError('calls.join needs the record, { resource, key }')
  if (typeof member !== 'string' || member.length === 0) throw new TypeError('calls.join needs the member, a non-empty string')
}

const withoutCalls = () => Promise.reject(new Error('This app has no calls: configure calls: { backend } in protobase.config.ts'))

/**
 * Calls as a function sees them, for the caller `caller` gives: a public function's resolves only once it is asked
 * for, and rejects without a valid token. An app without calls loads none of their code.
 */
export const callsAccess = (service: CallsService | undefined, caller: () => Promise<CallsCaller>): CallsAccess => {
  if (!service) return { join: withoutCalls, remove: withoutCalls, of: withoutCalls }
  return {
    join: async (member) => {
      checkMember(member)
      const { session, records } = await caller()
      if (session.anonymous || session.user.id === anonymousUserId) throw forbidden('call-needs-user', 'Sign in to join a call')
      const { resource, key } = member.record
      const record = service.recordOf(resource, key)
      const mayRead = () => records.get(resource, key)
      await mayRead()
      const ring = member.ring && checkRing(member.ring)
      const by = { user: String(session.user.id), ...(ring && { ring }) }
      const events = await (await service.runtime()).relay(record, member.member, { publish: member.publish, ...(member.hears && { hears: member.hears }) }, by)
      return {
        ...events,
        maxMessageBytes,
        recheck: async () => {
          await mayRead()
          await member.recheck?.()
        },
      }
    },
    remove: async (call, member) => (await service.runtime()).remove(call, member),
    of: async ({ resource, key }) => (await service.runtime()).of(service.recordOf(resource, key)),
  }
}
