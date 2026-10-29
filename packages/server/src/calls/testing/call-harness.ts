import type { CallServerMessage } from '@protobase/schema/internal'
import type { FunctionSocket } from '../../functions/function-socket'
import { callHub, type CallHub } from '../call-hub'
import type { CallRights } from '../call-member'
import type { CallRecord } from '../call-store'
import type { PeerBackend } from '../calls-options'
import { memberRelay } from '../member-relay'
import { peerBackend } from '../peer/peer-backend'
import { memoryCallStore } from './memory-call-store'

/** The record the harness's members meet on, unless a test names another. */
export const standup: CallRecord = { resource: 'meetings', key: '1' }

/**
 * Members of peer-to-peer calls through the real relay, hub and plugin, over the memory store: each `process` is a
 * hub of its own on the same store, as processes share the database. Each member's browser keeps what it was sent.
 */
export const callHarness = ({ manyProcesses = false, settings = { kind: 'peer', iceServers: [{ urls: ['stun:stun.example.com'] }] } as PeerBackend, maxMembers = 8, now }: { manyProcesses?: boolean; settings?: PeerBackend; maxMembers?: number; now?: () => number } = {}) => {
  const store = memoryCallStore(now)
  const reported: unknown[] = []
  const report = (error: unknown) => void reported.push(error)
  const backend = peerBackend(settings)
  const process = () => callHub({ store, manyProcesses, report })
  const first = process()

  const member = async (name: string, { hub = first, record = standup, rights = { publish: true } }: { hub?: CallHub; record?: CallRecord; rights?: CallRights } = {}) => {
    const sent: CallServerMessage[] = []
    // How the relay closed the member's socket, each time.
    const closes: [number | undefined, string | undefined][] = []
    const browser = {
      send: async (data: string | ArrayBuffer | Uint8Array) => void sent.push(JSON.parse(String(data))),
      close: (code?: number, reason?: string) => void closes.push([code, reason]),
      bufferedAmount: 0,
    } satisfies FunctionSocket
    const events = memberRelay({ door: hub, backend, record, member: name, rights, maxMembers, maxMinutes: 60, report })
    await events.onOpen!(browser)
    const send = (message: object) => events.onMessage!(JSON.stringify(message), browser)
    const last = <T extends CallServerMessage['type']>(type: T) => sent.filter((message) => message.type === type).at(-1) as Extract<CallServerMessage, { type: T }> | undefined
    return { sent, closes, send, last, closed: (code: number) => events.onClose!(code, ''), hub }
  }
  return { store, reported, hub: first, process, member }
}

/** Lets the hub's reads and writes that follow a message settle. */
export const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
