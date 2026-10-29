import { randomUUID } from 'node:crypto'
import type { CallRosterMember } from '@protobase/schema/internal'
import { fixedWindow } from '../realtime/fixed-window'
import type { RosterMember } from './call-reads'
import type { CallRingInput } from './call-ring'
import type { AdmitInput } from './call-store'
import type { CallStore } from './calls-store'
import type { CallRoom, MemberLink, RosterListener, SignalBody } from './media-backend'

type Local = { call: string; member: string; row: string; link: MemberLink; listener?: RosterListener; sent?: string; signals: () => boolean }

export type CallHubOptions = {
  store: CallStore
  /** With several processes, signals for a member another process serves go through the `calls` schema. */
  manyProcesses: boolean
  report: (error: unknown) => void
}

/** Signals a member may pass in a second at most; more are dropped. */
const signalsPerSecond = 100
/** How often the signals for this process are read, with several processes. */
const signalsEveryMs = 100

const rosterOf = (members: RosterMember[]): CallRosterMember[] => members.map(({ member, joined_at }) => ({ member, joined_at }))

/**
 * The members this process serves, in their calls, whose records the `calls` schema keeps. A member is in only while
 * the call's record says so, with this process serving them: a removal, the call's end or another process taking
 * them over closes their socket at the next read, a second at most. A signal goes from a member in a call to another
 * member of the same call only, straight to their socket here, or through the `calls` schema to the process that
 * serves them.
 */
export const callHub = ({ store, manyProcesses, report }: CallHubOptions) => {
  const process = randomUUID()
  const locals = new Map<string, Local>()
  const known = new Map<string, RosterMember[]>()
  let signalTimer: ReturnType<typeof setTimeout> | undefined

  const ofCall = (call: string) => [...locals.values()].filter((local) => local.call === call)

  // Closes a member's socket here with why they are out; the relay then ends their media session.
  const drop = (local: Local, reason: 'removed' | 'ended') => {
    locals.delete(local.row)
    local.link.send({ type: 'left', reason })
    local.link.close(reason === 'ended' ? 1000 : 1008, reason)
  }

  const apply = (call: string, found: { ended: boolean; members: RosterMember[] } | undefined) => {
    const members = found && !found.ended ? found.members : []
    if (members.length === 0) known.delete(call)
    else known.set(call, members)
    for (const local of ofCall(call)) {
      const mine = members.some((member) => member.row === local.row && member.process === process)
      if (!mine) {
        drop(local, !found || found.ended ? 'ended' : 'removed')
        continue
      }
      // Not before the member's session told their browser it joined.
      if (!local.listener) continue
      const body = JSON.stringify(members)
      if (local.sent === body) continue
      local.sent = body
      local.link.send({ type: 'members', members: rosterOf(members) })
      local.listener?.(members)
    }
  }

  /** Reads who is in these calls and tells their members here. */
  const refresh = async (calls: readonly string[]) => {
    const found = await store.rosters(calls)
    for (const call of calls) apply(call, found.get(call))
  }

  const deliver = (call: string, to: string, from: string, body: SignalBody) => {
    const target = ofCall(call).find((local) => local.member === to)
    target?.link.send({ type: 'signal', from, ...(body.description && { description: body.description }), ...(body.candidate && { candidate: body.candidate }) })
  }

  // A member this process does not know of yet may have just come in through another process: read the call once more.
  const inCall = async (call: string, member: string) => {
    const find = () => known.get(call)?.find((present) => present.member === member)
    if (find()) return find()
    await refresh([call])
    return find()
  }

  const readSignals = async () => {
    for (const signal of await store.takeSignals(process, 500)) {
      if (!(await inCall(signal.call, signal.from))) continue
      deliver(signal.call, signal.to, signal.from, signal.body as SignalBody)
    }
  }
  const followSignals = () => {
    if (!manyProcesses || signalTimer || locals.size === 0) return
    const tick = () => {
      if (locals.size === 0) {
        signalTimer = undefined
        return
      }
      readSignals()
        .catch(report)
        .finally(() => {
          signalTimer = setTimeout(tick, signalsEveryMs)
          ;(signalTimer as { unref?: () => void }).unref?.()
        })
    }
    signalTimer = setTimeout(tick, signalsEveryMs)
    ;(signalTimer as { unref?: () => void }).unref?.()
  }

  const signal = async (self: Local, to: string, body: SignalBody) => {
    if (locals.get(self.row) !== self || !self.signals()) return
    if (!(await inCall(self.call, self.member))) return
    const target = await inCall(self.call, to)
    if (!target || target.member === self.member) return
    if (target.process === process) return deliver(self.call, to, self.member, body)
    if (manyProcesses) await store.writeSignal({ process: target.process, call: self.call, to, from: self.member, body })
  }

  return {
    process,
    /** How many members this process serves. */
    get size() {
      return locals.size
    },
    /**
     * Lets the member in, or says why not. Once in, `listen` gets who is in the call; `leave` ends their time in it,
     * `detach` only stops this process hearing of them, as when their socket was lost: they are out `graceSeconds`
     * later unless their browser resumes.
     */
    admit: async (input: Omit<AdmitInput, 'process'>, link: MemberLink) => {
      const admitted = await store.admit({ ...input, process })
      if ('refused' in admitted) return admitted
      const local: Local = { call: admitted.call, member: input.member, row: admitted.row, link, signals: fixedWindow(signalsPerSecond, 1000) }
      // The member's socket before, here: their new one takes its place.
      for (const before of ofCall(admitted.call)) if (before.member === input.member && before.row === admitted.row) drop(before, 'removed')
      locals.set(local.row, local)
      followSignals()
      const room: CallRoom = {
        call: admitted.call,
        tracks: async (tracks) => {
          if (locals.get(local.row) !== local) return
          await store.setTracks(local.row, process, tracks)
          await refresh([local.call])
        },
        signal: (to, body) => signal(local, to, body),
      }
      return {
        call: admitted.call,
        started: admitted.started,
        room,
        listen: async (listener: RosterListener) => {
          local.listener = listener
          await refresh([local.call])
        },
        // Only a member still in the call here leaves it: one closed out, or taken over by a new socket, already is.
        leave: async () => {
          if (locals.get(local.row) !== local) return
          locals.delete(local.row)
          await store.leave(local.row, process)
          await refresh([local.call])
        },
        detach: () => {
          if (locals.get(local.row) === local) locals.delete(local.row)
        },
      }
    },
    /** Reads every call this process serves a member of, and tells them; a member no longer in theirs is closed out. */
    refreshAll: () => refresh([...new Set([...locals.values()].map((local) => local.call))]),
    /** Tells the calls' records that this process still serves its members. */
    beat: () => store.heartbeat(process, [...locals.keys()]),
    /** The calls this process serves a member of, for a change made here, such as a removal. */
    refresh,
  }
}

export type CallHub = ReturnType<typeof callHub>

/** A member in a call, as `CallHub.admit` lets them in. */
export type InCall = Exclude<Awaited<ReturnType<CallHub['admit']>>, { refused: unknown }>

/**
 * Where the relay lets members in: the hub, or a stand-in of it in tests. `user` is the signed-in user the member is,
 * and `ring` whom the call rings when this join starts it.
 */
export type CallDoor = {
  admit: (input: Parameters<CallHub['admit']>[0] & { user?: string; ring?: CallRingInput }, link: MemberLink) => ReturnType<CallHub['admit']>
}
