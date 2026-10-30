import type { FunctionSocket, SocketEvents } from '../functions/function-socket'
import { forbidden } from '../problem'
import { parseClientMessage } from './client-message'
import { guestTokenPrefix, tokenHash } from './guest-tokens'
import type { CallsRuntime } from './calls-runtime'

/** How long a guest's socket may stay open before its first message names the guest, in milliseconds. */
export const guestFirstMessageMs = 10_000
const refusedCloseCode = 1008
const maxMessageBytes = 300 * 1024

/**
 * A guest's call socket: open to anyone, it lets in only a guest whose first message, their `join` or `resume`, carries
 * the token of a guest a member let in who may still be in the call. From then on it is a member's socket, as `guest:<id>` in their link's call,
 * checked every minute: removed, their link revoked or expired, guests turned off or the call ended closes it. A
 * socket that names no such guest, or none in time, closes with 1008 and `refused` (the address is counted).
 */
export const guestSocket = (runtime: CallsRuntime, refused: () => void): SocketEvents => {
  let socket: FunctionSocket
  let relay: SocketEvents | undefined
  let guest: string | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  const refuse = () => {
    refused()
    void socket.send(JSON.stringify({ type: 'left', reason: 'refused' }))
    socket.close(refusedCloseCode, 'Not let into this call')
  }

  const first = async (data: string | ArrayBuffer) => {
    clearTimeout(timer)
    const message = parseClientMessage(data)
    const hash = message && (message.type === 'join' || message.type === 'resume') ? tokenHash(guestTokenPrefix, message.guest) : undefined
    const row = hash && (await runtime.guests().byToken(hash))
    if (!row || row.admitted !== true || !(await runtime.guests().stillAllowed(row.id))) return refuse()
    guest = row.id
    relay = await runtime.relayGuest(row)
    await relay.onOpen?.(socket)
    await relay.onMessage?.(data, socket)
  }

  return {
    maxMessageBytes,
    onOpen: (opened) => {
      socket = opened
      timer = setTimeout(refuse, guestFirstMessageMs)
      ;(timer as { unref?: () => void }).unref?.()
    },
    onMessage: (data) => (relay ? relay.onMessage?.(data, socket) : first(data)),
    onClose: (code, reason) => {
      clearTimeout(timer)
      return relay?.onClose?.(code, reason)
    },
    recheck: async () => {
      if (guest === undefined) return
      if (!(await runtime.guests().stillAllowed(guest))) throw forbidden('guest-not-allowed', 'This guest may no longer be in the call')
    },
  }
}
