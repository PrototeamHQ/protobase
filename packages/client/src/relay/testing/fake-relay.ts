import { vi } from 'vitest'
import { encodeFrame, type Frame } from '../phoenix-frame'
import type { RelaySocketLike } from '../relay-socket'

type TestSocket = Omit<RelaySocketLike, 'readyState'> & { readyState: number; url: string; sent: Frame[]; frame: (frame: Frame) => void; reply: (to: Frame, status: 'ok' | 'error', reason?: string) => void; drop: () => void; opened: () => void }

/** The relay's end of the sockets a test's client opens: what each was sent, as frames, and a way to answer. */
export const fakeRelay = () => {
  const sockets: TestSocket[] = []
  const open = (url: string) => {
    const socket: TestSocket = {
      url,
      readyState: 0,
      sent: [],
      onopen: null,
      onmessage: null,
      onclose: null,
      send: (data) => {
        const [joinRef, ref, topic, event, payload] = JSON.parse(data as string) as [string | null, string | null, string, string, Record<string, unknown>]
        socket.sent.push({ joinRef, ref, topic, event, payload })
      },
      close: vi.fn(() => socket.drop()),
      frame: (frame) => socket.onmessage?.({ data: encodeFrame(frame) }),
      // As the relay answers: `[join_ref, ref, topic, "phx_reply", {"status", "response"}]`.
      reply: (to, status, reason) => socket.frame({ joinRef: to.joinRef, ref: to.ref, topic: to.topic, event: 'phx_reply', payload: { status, response: reason ? { reason } : {} } }),
      drop: () => {
        if (socket.readyState === 3) return
        socket.readyState = 3
        socket.onclose?.({})
      },
      opened: () => {
        socket.readyState = 1
        socket.onopen?.({})
      },
    }
    sockets.push(socket)
    return socket
  }
  return { sockets, open, latest: () => sockets.at(-1)! }
}
