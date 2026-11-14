import { maxLimit, type LimitPer } from '@protobase/query'
import type { ResourceModel } from '@protobase/schema'
import { badRequest } from './problem'

const invalid = (message: string) => badRequest('invalid-parameter', `Invalid parameter limit_per: ${message}`, { errors: [{ parameter: 'limit_per', message }] })

/**
 * `limit_per=<field>:<n>`: keep the first n rows per value of a filterable field of the model as the caller sees it,
 * n a whole number from 1 to the largest page size. A hidden field is refused exactly like an unknown one.
 */
export const limitPerOf = (model: ResourceModel, text?: string): LimitPer | undefined => {
  if (text === undefined) return
  const match = /^([^:]+):(\d+)$/.exec(text)
  if (!match) throw invalid('Give <field>:<n>, such as task_id:3')
  const [, field, count] = match as unknown as [string, string, string]
  const target = Object.hasOwn(model.fields, field) ? model.fields[field] : undefined
  if (!target) throw invalid(`Unknown field "${field}"`)
  if (!target.filterable) throw invalid(`Field "${field}" is not filterable`)
  if (target.type === 'json') throw invalid(`Field "${field}" is json, which has no values to keep rows per`)
  const limit = Number(count)
  if (limit < 1 || limit > maxLimit) throw invalid(`n must be a whole number from 1 to ${maxLimit}`)
  return { field, limit }
}
