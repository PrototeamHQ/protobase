import type { ResourceModel } from '@protobase/schema'
import type { ResourceChange } from '../changes/resource-change'

/** What a notice records of a change. */
export type NoticeChange = Pick<ResourceChange, 'resource' | 'key' | 'operation' | 'tenant'>

/**
 * The key of a notice that names no record: one of the resources a `.live({ reads })` resource reads changed, so any
 * of its records may have, and its pages read it again whole.
 */
export const anyRecord = ''

/**
 * The notices a batch of changes makes, in order: each change of a live resource, and for each live resource that
 * reads the changed one (`.live({ reads })`), an update of `anyRecord` in the change's tenant, once per batch. Only the
 * direct readers: a reader never reads another reader (checkLiveReads), so no change reaches one through another.
 */
export const liveNotices = (models: readonly ResourceModel[], changes: readonly ResourceChange[]): NoticeChange[] => {
  const own = new Set(models.filter((model) => model.live && !model.liveReads).map((model) => model.name))
  const readers = models.filter((model) => model.live && model.liveReads)
  const seen = new Set<string>()
  return changes.flatMap((change) => {
    const notices: NoticeChange[] = own.has(change.resource) ? [change] : []
    for (const reader of readers.filter((model) => model.liveReads!.includes(change.resource))) {
      const notice = { resource: reader.name, key: anyRecord, operation: 'update' as const, ...(change.tenant !== undefined && { tenant: change.tenant }) }
      const id = JSON.stringify([notice.resource, notice.tenant ?? null])
      if (seen.has(id)) continue
      seen.add(id)
      notices.push(notice)
    }
    return notices
  })
}
