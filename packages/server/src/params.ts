import { z } from 'zod'
import type { ResourceModel } from '@protobase/schema'
import { badRequest } from './problem'

/** Parses query or body parameters; a failure is a 400 problem listing each offending parameter. */
export const parseParams = <S extends z.ZodType>(schema: S, input: unknown): z.output<S> => {
  const parsed = schema.safeParse(input)
  if (parsed.success) return parsed.data
  const errors = parsed.error.issues.map((issue) => ({ parameter: issue.path.join('.'), message: issue.message }))
  throw badRequest('invalid-parameter', `Invalid parameter ${errors[0]!.parameter}: ${errors[0]!.message}`, { errors })
}

export const defaultPageSize = 50
export const maxPageSize = 500

export const listParams = z.object({
  filter: z.string().optional(),
  order_by: z.string().optional(),
  page_size: z.coerce.number().int().min(0).optional(),
  page_token: z.string().optional(),
  fields: z.union([z.string(), z.array(z.string())]).optional(),
  count: z.literal('exact').optional(),
  show_deleted: z.union([z.boolean(), z.enum(['true', 'false']).transform((value) => value === 'true')]).optional(),
})

/** The list parameters plus the row position to jump to (`:seek`). */
export const seekParams = listParams.extend({ position: z.coerce.number().int().min(0) })

/** AIP-158: 0 or absent means the default, anything above the maximum is coerced down. */
export const pageSizeOf = (requested?: number) => Math.min(requested || defaultPageSize, maxPageSize)

/** AIP-157 style column selection: comma separated field names, or an array in a body. */
export const selectedFields = (model: ResourceModel, fields?: string | string[]) => {
  if (fields === undefined) return undefined
  const names = (Array.isArray(fields) ? fields : fields.split(',')).map((name) => name.trim()).filter(Boolean)
  const unknown = names.filter((name) => !Object.hasOwn(model.fields, name))
  if (unknown.length > 0) throw badRequest('invalid-parameter', `Unknown fields: ${unknown.join(', ')}`, { errors: unknown.map((name) => ({ parameter: 'fields', message: `Unknown field "${name}"` })) })
  return names.length > 0 ? names : undefined
}

/** AIP-164 `show_deleted`: only soft-delete resources have deleted rows to show. */
export const deletedRows = (model: ResourceModel, showDeleted?: boolean) => {
  if (!showDeleted) return 'hide' as const
  if (!model.softDelete) throw badRequest('invalid-parameter', `Resource "${model.name}" does not soft delete, so show_deleted does not apply`, { errors: [{ parameter: 'show_deleted', message: 'Not supported' }] })
  return 'show' as const
}
