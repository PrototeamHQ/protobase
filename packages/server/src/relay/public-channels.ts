import { channelRecord, type ChannelRecord } from '../channels/channel-name'
import type { Entry, Registry } from '../registry'
import { recordKey } from '../records'

/** Which of these keys of one resource the anonymous role reads, by `recordKey` (`readableKeys` with its session). */
export type AnonymousReadable = (entry: Entry, keys: ChannelRecord['key'][]) => Promise<Set<string>>

/**
 * Of the named open channels, those whose record the anonymous role reads now: one read for each resource. A name that
 * is not its record's own, or names no record, is not public, as a ticket refuses it.
 */
export const publicChannels = async (registry: Pick<Registry, 'find'>, readable: AnonymousReadable, channels: readonly string[]) => {
  const byResource = new Map<string, { entry: Entry; records: ChannelRecord[] }>()
  for (const name of channels) {
    const slash = name.indexOf('/')
    if (slash < 0) continue
    const record = channelRecord(registry, name.slice(0, slash), name.slice(slash + 1))
    if (record === undefined || record === 'too-long' || record.name !== name) continue
    const group = byResource.get(record.entry.name) ?? { entry: record.entry, records: [] }
    group.records.push(record)
    byResource.set(record.entry.name, group)
  }
  const open = new Set<string>()
  for (const { entry, records } of byResource.values()) {
    const found = await readable(entry, records.map((record) => record.key))
    for (const record of records) {
      const row = Object.fromEntries(entry.model.primaryKey.map((field, i) => [field, record.key[i]]))
      if (found.has(recordKey(entry, row))) open.add(record.name)
    }
  }
  return open
}
