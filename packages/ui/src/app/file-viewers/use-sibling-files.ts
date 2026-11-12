import type { ResourceModel } from '@protobase/schema'
import { useList } from '../../data/use-list'
import type { ViewedFile } from './file-viewer'
import { siblingFiles, siblingFilter } from './sibling-files'

// One page of siblings: a viewer's references are a handful of files, so a fixed limit is plain and cheap.
const siblingLimit = 100

/**
 * The siblings of `file` in `record`: the record's other files and those of the records of its resource that point at
 * the same records (`siblingFilter`), read in one list call. `ready` is false until that call has answered.
 */
export const useSiblingFiles = (model: ResourceModel, record: Record<string, unknown>, file: ViewedFile) => {
  const filter = siblingFilter(model, record)
  const fields = [...model.primaryKey, ...Object.values(model.fields).filter((field) => field.type === 'file').map((field) => field.name)]
  const list = useList(model.name, { filter, pageSize: siblingLimit, fields, enabled: filter !== undefined })
  const records = filter === undefined ? [record] : [record, ...list.items]
  return { siblings: siblingFiles(model, records, file), ready: filter === undefined || !list.isPending }
}
