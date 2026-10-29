import type { SocketEvents } from '../functions/function-socket'
import type { CallMember } from './call-member'
import type { CallBackend, CallsOptions } from './calls-options'
import type { MediaBackend } from './media-backend'

/** What a function admits members to calls with. */
export type CallsAccess = {
  /**
   * The member's media session in the call, as the events of the socket the function accepts for them: return
   * `acceptWebSocket(await calls.join(member))` once the function decided the caller may join. The browser's
   * `joinCall` from `@protobase/client/calls` speaks to it. Rejects when the app has no `calls` configured.
   */
  join: (member: CallMember) => Promise<SocketEvents>
}

const checkMember = ({ call, member }: CallMember) => {
  if (typeof call !== 'string' || call.length === 0) throw new TypeError('calls.join needs the call, a non-empty string')
  if (typeof member !== 'string' || member.length === 0) throw new TypeError('calls.join needs the member, a non-empty string')
}

// The plugin a backend's settings name, loaded only when a member first joins.
const loadBackend = async (settings: CallBackend): Promise<MediaBackend> => {
  if (settings.kind === 'livekit') return (await import('./livekit/livekit-session')).liveKitBackend(settings)
  return (await import('./peer/peer-backend')).peerBackend(settings)
}

/**
 * Calls as a function sees them: each member's socket goes through the relay to the configured plugin, made once, at
 * the first join, so an app without calls loads none of their code.
 */
export const callsAccess = (options: CallsOptions | undefined): CallsAccess => {
  let backend: Promise<MediaBackend> | undefined
  return {
    join: async (member) => {
      if (!options) throw new Error('This app has no calls: configure calls: { backend } in protobase.config.ts')
      checkMember(member)
      backend ??= loadBackend(options.backend)
      const [{ memberRelay }, plugin] = await Promise.all([import('./member-relay'), backend])
      return memberRelay(plugin, member)
    },
  }
}
