import type { Caller } from '../api-keys/resolve-caller'
import type { NoticeFeed } from '../live/notice-feed'
import type { Notice } from '../live/notices-sql'
import type { Entry } from '../registry'
import { callerSettings } from '../rest/caller-settings'
import type { ChangeChecker, CheckGroup, ResourceView } from './change-checker'
import { changePayload, eventOf, type ChangePayload } from './change-payload'
import type { ChangeBinding, ChangeEvent } from './postgres-changes'

/** A joined channel's `postgres_changes` bindings, its caller at the time of each check, and where its changes go. */
export type ChangeSink = {
  caller: () => Caller
  bindings: ChangeBinding[]
  send: (payload: ChangePayload) => void
  /** Ends the channel with `message`, once Postgres refused one of its filters; the hub has removed it. */
  fail: (message: string) => void
}

export type ChangeHubOptions = {
  feed: NoticeFeed
  check: ChangeChecker
  /** The live resource a notice names; notices of others are skipped. */
  entry: (resource: string) => Entry | undefined
  report: (error: unknown) => void
}

type Change = { notice: Notice; entry: Entry; type: ChangeEvent }

/** Why a channel ends when Postgres refuses its filter at a check: it names that filter only. */
export const failedFilterText = (filter: string) => `Unable to listen to changes with the filter "${filter}": the database refused it`

const unique = <T>(items: readonly T[]) => [...new Set(items)]

const watches = (binding: ChangeBinding, entry: Entry) => binding.entries.includes(entry)

// Each resource a group's sinks watch that changed, with its bindings' distinct filters.
const groupChecks = (sinks: readonly ChangeSink[], changes: readonly Change[]) =>
  unique(changes.map((change) => change.entry))
    .map((entry) => {
      const bindings = sinks.flatMap((sink) => sink.bindings).filter((binding) => watches(binding, entry))
      const of = changes.filter((change) => change.entry === entry)
      // One filter per text: bindings with the same text have the same conditions.
      const filters = [...new Map(bindings.filter((binding) => binding.conditions.length > 0).map((binding) => [binding.filter!, binding.conditions])).entries()]
      return {
        entry,
        bindings,
        filters,
        filterIndex: new Map(filters.map(([filter], index) => [filter, index])),
        keys: unique(of.filter((change) => change.type !== 'DELETE').map((change) => change.notice.key)),
        deleted: unique(of.filter((change) => change.type === 'DELETE').map((change) => change.notice.key)),
      }
    })
    .filter((check) => check.bindings.length > 0)

/**
 * Where the open sockets of a process hear of changes: it follows the notice feed while any channel listens, and
 * checks each batch of notices for all channels at once, one batch at a time, so Realtime holds at most one pooled
 * connection per process, and only while a check runs. Channels whose callers have the same role and claims, such as a
 * user's tabs, are checked as one. A channel one of whose filters Postgres refuses is removed and ended.
 */
export const changeHub = ({ feed, check, entry, report }: ChangeHubOptions) => {
  const sinks = new Set<ChangeSink>()
  let subscription: Promise<{ stop: () => void } | undefined> | undefined
  let pending: Notice[] = []
  let running = false

  const deliver = async (notices: readonly Notice[]) => {
    const changes = notices.flatMap((notice): Change[] => {
      const found = entry(notice.resource)
      return found ? [{ notice, entry: found, type: eventOf(found, notice) }] : []
    })
    if (changes.length === 0 || sinks.size === 0) return
    const groups = new Map<string, ChangeSink[]>()
    for (const sink of sinks) {
      const key = JSON.stringify(callerSettings(sink.caller()))
      groups.set(key, [...(groups.get(key) ?? []), sink])
    }
    const planned = [...groups.values()].map((members) => ({ members, checks: groupChecks(members, changes) })).filter((group) => group.checks.length > 0)
    const groupsToCheck: CheckGroup[] = planned.map(({ members, checks }) => ({
      caller: members[0]!.caller(),
      resources: checks.map(({ entry: checked, keys, deleted, filters }) => ({
        entry: checked,
        keys,
        deleted,
        filters: filters.map(([, conditions]) => conditions),
      })),
    }))
    const views = await check(groupsToCheck)
    for (const { notice, entry: changed, type } of changes) {
      planned.forEach(({ members, checks }, groupIndex) => {
        const resourceIndex = checks.findIndex((item) => item.entry === changed)
        if (resourceIndex < 0) return
        const view: ResourceView = views[groupIndex]![resourceIndex]!
        const row = (type === 'DELETE' ? view.deleted : view.rows).get(notice.key)
        if (!row) return
        const { filterIndex } = checks[resourceIndex]!
        for (const sink of members) {
          if (!sinks.has(sink)) continue
          const ids = sink.bindings
            .filter((binding) => watches(binding, changed) && (binding.event === '*' || binding.event === type))
            .filter((binding) => binding.conditions.length === 0 || row.matches[filterIndex.get(binding.filter!)!])
            .map((binding) => binding.id)
          if (ids.length > 0) sink.send(changePayload(changed, notice, type, view.columns, row, ids))
        }
      })
    }
    planned.forEach(({ members, checks }, groupIndex) => {
      checks.forEach(({ entry: checked, filters }, resourceIndex) => {
        for (const index of views[groupIndex]![resourceIndex]!.failed) {
          const [filter] = filters[index]!
          for (const sink of members) {
            if (!sinks.has(sink) || !sink.bindings.some((binding) => watches(binding, checked) && binding.filter === filter)) continue
            remove(sink)
            sink.fail(failedFilterText(filter))
          }
        }
      })
    })
  }

  const remove = (sink: ChangeSink) => {
    sinks.delete(sink)
    if (sinks.size > 0 || !subscription) return
    void subscription.then((subscribed) => subscribed?.stop())
    subscription = undefined
  }

  const run = async () => {
    running = true
    while (pending.length > 0) {
      const batch = pending
      pending = []
      await deliver(batch).catch(report)
    }
    running = false
  }

  const listen = (notices: Notice[]) => {
    pending.push(...notices)
    if (!running) void run()
  }

  return {
    /** Sends the sink the changes it may see from now on, until the returned function removes it. */
    add: (sink: ChangeSink) => {
      sinks.add(sink)
      subscription ??= feed.subscribe(listen).catch((error: unknown) => {
        report(error)
        subscription = undefined
        return undefined
      })
      return () => remove(sink)
    },
  }
}

export type ChangeHub = ReturnType<typeof changeHub>
