import type { ResourceModel } from '@protobase/schema'
import { selectedFields } from '../params'
import { pickFields } from '../rows'
import type { Row } from '../types'

/** `record` with only `fields`, each one of those it holds, which are those the caller may read; all of it without. */
export const recordFields = (model: ResourceModel, record: Row, fields: string[] | undefined) => {
  const readable = Object.fromEntries(Object.keys(record).map((name) => [name, model.fields[name]!]))
  return pickFields(record, selectedFields({ ...model, fields: readable }, fields))
}
