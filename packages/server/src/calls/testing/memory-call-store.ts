import { randomUUID } from 'node:crypto'
import type { CallRemoteTrack } from '@protobase/schema/internal'
import { admission } from '../admission'
import { recordId, type CallItem } from '../call-reads'
import type { StoredSignal } from '../call-signals-sql'
import { graceSeconds } from '../call-store'
import type { CallStore } from '../calls-store'

type Call = { id: string; record: string; started_by: string; started_at: number; ends_at: number; ended_at?: number }
type Member = { id: string; call: string; member: string; process: string; tracks: CallRemoteTrack[]; joined_at: number; seen_at: number; left_at?: number; removed_at?: number }

const iso = (at: number) => new Date(at).toISOString()

/**
 * The `calls` schema's rules in memory, for unit tests of the hub, the relay and the plugins: one call going on per
 * record, admission by `admission`, removals kept, the grace after the last heartbeat, and an end with the last member.
 * The real store's own tests run the same rules against Postgres.
 */
export const memoryCallStore = (now = () => Date.now()) => {
  const calls = new Map<string, Call>()
  const members: Member[] = []
  const signals: StoredSignal[] = []
  let ids = 0
  const next = () => String(++ids)

  const present = (call: string) => members.filter((row) => row.call === call && row.left_at === undefined)
  const end = (call: Call) => {
    call.ended_at ??= now()
    for (const row of present(call.id)) row.left_at = now()
  }
  const endIfEmpty = (call: Call) => {
    if (present(call.id).length === 0) end(call)
  }
  const expire = (call: string) => {
    for (const row of present(call)) if (row.seen_at < now() - graceSeconds * 1000) row.left_at = now()
  }

  const store: CallStore = {
    admit: async ({ record, member, process, resume, maxMembers, maxMinutes }) => {
      const key = recordId(record)
      let call: Call | undefined
      if (resume) {
        call = calls.get(resume.call)
        if (!call || call.ended_at !== undefined || call.record !== key) return { refused: 'ended' }
        if (call.ends_at <= now()) {
          end(call)
          return { refused: 'ended' }
        }
      } else {
        call = [...calls.values()].find((candidate) => candidate.record === key && candidate.ended_at === undefined)
        if (call && call.ends_at <= now()) {
          end(call)
          call = undefined
        }
        if (!call) {
          call = { id: randomUUID(), record: key, started_by: member, started_at: now(), ends_at: now() + maxMinutes * 60_000 }
          calls.set(call.id, call)
        }
      }
      expire(call.id)
      const refused = admission({
        removed: members.some((row) => row.call === call.id && row.member === member && row.removed_at !== undefined),
        present: present(call.id).map((row) => row.member),
        member,
        maxMembers,
      })
      if (refused) return { refused }
      const own = present(call.id).find((row) => row.member === member)
      if (own) {
        Object.assign(own, { process, seen_at: now(), tracks: resume?.tracks ?? [] })
        return { call: call.id, row: own.id }
      }
      const row: Member = { id: next(), call: call.id, member, process, tracks: resume?.tracks ?? [], joined_at: now(), seen_at: now() }
      members.push(row)
      return { call: call.id, row: row.id }
    },
    leave: async (id, process) => {
      const row = members.find((candidate) => candidate.id === id)
      const call = row && calls.get(row.call)
      if (!row || !call || call.ended_at !== undefined) return
      if (row.process === process && row.left_at === undefined) row.left_at = now()
      endIfEmpty(call)
    },
    remove: async (id, member) => {
      const call = calls.get(id)
      if (!call || call.ended_at !== undefined) return false
      const row = present(id).find((candidate) => candidate.member === member)
      if (!row) {
        members.push({ id: next(), call: id, member, process: '', tracks: [], joined_at: now(), seen_at: now(), left_at: now(), removed_at: now() })
        return false
      }
      row.left_at = now()
      row.removed_at = now()
      endIfEmpty(call)
      return true
    },
    setTracks: async (id, process, tracks) => {
      const row = members.find((candidate) => candidate.id === id && candidate.process === process && candidate.left_at === undefined)
      if (row) row.tracks = tracks
    },
    heartbeat: async (process, rows) => {
      for (const row of members) if (rows.includes(row.id) && row.process === process && row.left_at === undefined) row.seen_at = now()
    },
    sweep: async () => {
      for (const call of calls.values()) {
        if (call.ended_at !== undefined) continue
        expire(call.id)
        if (call.ends_at <= now()) end(call)
        else endIfEmpty(call)
      }
    },
    rosters: async (ids) => {
      const found = new Map<string, { ended: boolean; members: { row: string; member: string; process: string; joined_at: string; tracks: CallRemoteTrack[] }[] }>()
      for (const id of ids) {
        const call = calls.get(id)
        if (!call) continue
        found.set(id, { ended: call.ended_at !== undefined, members: present(id).map((row) => ({ row: row.id, member: row.member, process: row.process, joined_at: iso(row.joined_at), tracks: row.tracks })) })
      }
      return found
    },
    recordCalls: async (records) => {
      const found = new Map<string, CallItem[]>()
      for (const record of records) {
        const key = recordId(record)
        const items = [...calls.values()]
          .filter((call) => call.record === key)
          .reverse()
          .sort((a, b) => Number(a.ended_at !== undefined) - Number(b.ended_at !== undefined))
          .map((call) => ({
            id: call.id,
            started_by: call.started_by,
            started_at: iso(call.started_at),
            ended_at: call.ended_at === undefined ? null : iso(call.ended_at),
            members: present(call.id).map((row) => ({ member: row.member, joined_at: iso(row.joined_at) })),
            removed: members.filter((row) => row.call === call.id && row.removed_at !== undefined).map((row) => ({ member: row.member, removed_at: iso(row.removed_at!) })),
          }))
        found.set(key, items)
      }
      return found
    },
    writeSignal: async (signal) => void signals.push({ id: next(), ...signal }),
    takeSignals: async (process, limit) => {
      const taken = signals.filter((signal) => signal.process === process).slice(0, limit)
      for (const signal of taken) signals.splice(signals.indexOf(signal), 1)
      return taken
    },
  }
  return Object.assign(store, { calls, members, signals })
}
