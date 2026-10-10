import type { Entry } from '../registry'
import { writableFields, type RequestAccess } from '../request-access'
import { pascal } from './naming'

const param = (name: string) => ({ $ref: `#/components/parameters/${name}` })
const error = (name: string) => ({ $ref: `#/components/responses/${name}` })
const json = (schema: object) => ({ 'application/json': { schema } })
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` })

const listParameters = (entry: Entry) =>
  ['filter', 'orderBy', 'pageSize', 'pageToken', 'fields', 'count', ...(entry.model.softDelete ? ['showDeleted'] : [])].map(param)

const field = (description: string) => ({ name: 'field', in: 'query', required: true, description, schema: { type: 'string' } })

const query = (name: string, description: string, schema: object = { type: 'string' }, required = false) => ({ name, in: 'query', required, description, schema })

const record = (name: string, entry: Entry) => ({
  description: `The ${entry.name} record. The ETag header is its version.`,
  headers: { ETag: { schema: { type: 'string' } } },
  content: json(ref(name)),
})

const page = (name: string, seek = false) => json({
  type: 'object',
  required: ['items', 'next_page_token', 'total_size_estimate'],
  properties: {
    items: { type: 'array', items: ref(name) },
    next_page_token: { type: 'string', description: 'Empty on the last page' },
    ...(seek && { prev_page_token: { type: 'string', description: 'Empty on the first page' } }),
    total_size_estimate: { type: 'integer', description: 'The planner\'s estimate' },
    total_size: { type: 'integer', description: 'Only with count=exact' },
  },
})

// The operation each documented method needs; methods the caller may not use are left out of their document.
const needs: Record<string, 'list' | 'read' | 'create' | 'update' | 'delete'> = {
  list: 'list', search: 'list', facets: 'list', series: 'list', histogram: 'list', seek: 'list',
  get: 'read', reveal: 'read', create: 'create', update: 'update', undelete: 'update', delete: 'delete',
}

const withoutDenied = (paths: Record<string, Record<string, any>>, access: RequestAccess) =>
  Object.fromEntries(
    Object.entries(paths).flatMap(([path, methods]) => {
      const allowed = Object.entries(methods).filter(([, operation]) => access.resolved.operations[needs[String(operation.operationId).split('_')[0]!]!])
      return allowed.length > 0 ? [[path, Object.fromEntries(allowed)]] : []
    }),
  )

const auth = { 401: error('Unauthorized') }

/** The paths of one resource: AIP-132 list, AIP-131 get, AIP-133 create, AIP-134 update, AIP-135 delete, and the `:` helpers (AIP-136). */
export const resourcePaths = (access: RequestAccess) => {
  const { entry } = access
  const name = pascal(entry.name)
  const tag = [entry.name]
  const tenantNote = entry.model.tenant ? ' Rows of other tenants are never visible.' : ''
  const softNote = entry.model.softDelete ? ' Soft-deleted rows are hidden.' : ''
  const keyErrors = { 400: error('BadRequest'), ...auth, 404: error('NotFound') }
  const sensitive = Object.values(access.readable.fields).filter((field) => field.sensitive).map((field) => field.name)

  const paths = {
    [`/${entry.name}`]: {
      get: {
        operationId: `list_${entry.name}`,
        tags: tag,
        summary: `List ${entry.name}`,
        description: `Keyset paginated list.${tenantNote}${softNote}`,
        parameters: listParameters(entry),
        responses: { 200: { description: 'A page', content: page(name) }, 400: error('BadRequest'), ...auth },
      },
      post: {
        operationId: `create_${entry.name}`,
        tags: tag,
        summary: `Create a ${entry.name} record`,
        parameters: [param('prefer')],
        requestBody: { required: true, content: json(ref(`${name}Create`)) },
        responses: {
          201: { description: 'Created; Location and ETag headers', content: json(ref(name)) },
          400: error('BadRequest'), ...auth, 403: error('Forbidden'), 409: error('Conflict'),
        },
      },
    },
    [`/${entry.name}:search`]: {
      post: {
        operationId: `search_${entry.name}`,
        tags: tag,
        summary: `List ${entry.name} with a JSON body`,
        requestBody: { required: true, content: json({ $ref: '#/components/schemas/SearchBody' }) },
        responses: { 200: { description: 'A page', content: page(name) }, 400: error('BadRequest'), ...auth },
      },
    },
    [`/${entry.name}/{key}`]: {
      get: {
        operationId: `get_${entry.name}`,
        tags: tag,
        summary: `Get a ${entry.name} record`,
        parameters: [param('key'), param('fields'), ...(entry.model.softDelete ? [param('showDeleted')] : [])],
        responses: { 200: record(name, entry), ...keyErrors },
      },
      patch: {
        operationId: `update_${entry.name}`,
        tags: tag,
        summary: `Update a ${entry.name} record`,
        description: 'Only the fields in the body change. Needs If-Match; a stale ETag is a 412.',
        parameters: [param('key'), param('ifMatch'), param('prefer')],
        requestBody: { required: true, content: json(ref(`${name}Update`)) },
        responses: {
          200: record(name, entry), 204: { description: 'With Prefer: return=minimal' },
          ...keyErrors, 403: error('Forbidden'), 409: error('Conflict'), 412: error('PreconditionFailed'), 428: error('PreconditionRequired'),
        },
      },
      delete: {
        operationId: `delete_${entry.name}`,
        tags: tag,
        summary: `Delete a ${entry.name} record`,
        description: entry.model.softDelete ? 'Soft delete: the record is hidden and can be restored.' : 'Removes the row.',
        parameters: [param('key'), param('ifMatchOptional'), param('prefer')],
        responses: { 204: { description: 'Deleted' }, ...keyErrors, 403: error('Forbidden'), 409: error('Conflict'), 412: error('PreconditionFailed') },
      },
    },
    ...(entry.model.softDelete && {
      [`/${entry.name}/{key}:undelete`]: {
        post: {
          operationId: `undelete_${entry.name}`,
          tags: tag,
          summary: `Restore a deleted ${entry.name} record`,
          description: '[AIP-164](https://google.aip.dev/164): restores a deleted record. A record that is not deleted is a 409.',
          parameters: [param('key'), param('ifMatchOptional'), param('prefer')],
          responses: { 200: record(name, entry), 204: { description: 'With Prefer: return=minimal' }, ...keyErrors, 403: error('Forbidden'), 409: error('Conflict'), 412: error('PreconditionFailed') },
        },
      },
    }),
    ...(sensitive.length > 0 && {
      [`/${entry.name}/{key}:reveal`]: {
        post: {
          operationId: `reveal_${entry.name}`,
          tags: tag,
          summary: `Reveal a sensitive field of a ${entry.name} record`,
          description: 'A sensitive field never comes with the record. This returns its value for one record, with the same access as a get, and publishes an audit event first.',
          parameters: [param('key')],
          requestBody: { required: true, content: json({ type: 'object', required: ['field'], properties: { field: { type: 'string', enum: sensitive } }, additionalProperties: false }) },
          responses: { 200: { description: 'The value; never cached', content: json({ type: 'object', required: ['field', 'value'], properties: { field: { type: 'string' }, value: {} } }) }, ...keyErrors },
        },
      },
    }),
    [`/${entry.name}:facets`]: {
      get: {
        operationId: `facets_${entry.name}`,
        tags: tag,
        summary: `Value counts of a ${entry.name} field`,
        description: 'Applies the filter except its own terms on the field.',
        parameters: [field('A filterable field'), param('filter'), query('limit', 'Most values to return', { type: 'integer' })],
        responses: {
          200: { description: 'Counts, most frequent first', content: json({ type: 'object', properties: { field: { type: 'string' }, facets: { type: 'array', items: { type: 'object', properties: { value: {}, count: { type: 'integer' } } } } } }) },
          400: error('BadRequest'), ...auth,
        },
      },
    },
    [`/${entry.name}:series`]: {
      get: {
        operationId: `series_${entry.name}`,
        tags: tag,
        summary: `Counts per time bucket of a ${entry.name} date field`,
        parameters: [
          field('A filterable date or timestamp field'), param('filter'),
          query('range', 'Relative range ending now (default 30d); `all` starts at the earliest row', { type: 'string', enum: ['7d', '30d', '90d', '1y', 'all'] }),
          query('from', 'Explicit start (ISO 8601); with `to`, replaces range'), query('to', 'Exclusive end (ISO 8601), default now'),
          query('granularity', 'Default day', { type: 'string', enum: ['hour', 'day', 'week', 'month'] }),
          query('time_zone', 'IANA time zone for the buckets, default UTC'),
        ],
        responses: {
          200: { description: 'Buckets in local ISO time, empty ones included', content: json({ type: 'object', properties: { field: { type: 'string' }, granularity: { type: 'string' }, time_zone: { type: 'string' }, points: { type: 'array', items: { type: 'object', properties: { bucket: { type: 'string' }, count: { type: 'integer' } } } } } }) },
          400: error('BadRequest'), ...auth,
        },
      },
    },
    [`/${entry.name}:histogram`]: {
      get: {
        operationId: `histogram_${entry.name}`,
        tags: tag,
        summary: `Equal-width buckets of a numeric ${entry.name} field`,
        parameters: [field('A filterable numeric field'), param('filter'), query('buckets', 'Default 20, at most 200', { type: 'integer' })],
        responses: {
          200: { description: 'Buckets between the filtered minimum and maximum', content: json({ type: 'object', properties: { field: { type: 'string' }, min: { type: ['number', 'null'] }, max: { type: ['number', 'null'] }, buckets: { type: 'array', items: { type: 'object', properties: { from: { type: 'number' }, to: { type: 'number' }, count: { type: 'integer' } } } } } }) },
          400: error('BadRequest'), ...auth,
        },
      },
    },
    [`/${entry.name}:seek`]: {
      get: {
        operationId: `seek_${entry.name}`,
        tags: tag,
        summary: `A page of ${entry.name} at a row position`,
        description: 'For scrollbar jumps: resolves a 0-based row position, within the rows the caller can see and in the given order, to a page of rows, with no OFFSET. The estimate behind it is scaled to the caller\'s own rows; no column statistics or boundary values are returned, only the page and its tokens.',
        parameters: [
          query('position', '0-based row position to jump to', { type: 'integer', minimum: 0 }, true),
          param('orderBy'), param('filter'), param('pageSize'), param('fields'), param('count'),
        ],
        responses: {
          200: { description: 'The page at that position; continue from either token', content: page(name, true) },
          400: error('BadRequest'), ...auth,
        },
      },
    },
  }
  return { ...withoutDenied(paths, access), ...uploadPath(access) }
}

// For callers who may write a file field, on create or update.
const uploadPath = (access: RequestAccess) => {
  const { entry } = access
  const writable = new Set([...writableFields(access, 'create'), ...writableFields(access, 'update')])
  const fields = Object.values(access.readable.fields).filter((model) => model.file && writable.has(model.name)).map((model) => model.name)
  if (fields.length === 0) return {}
  const binary = { type: 'string', format: 'binary' }
  return {
    [`/${entry.name}:upload`]: {
      post: {
        operationId: `upload_${entry.name}`,
        tags: [entry.name],
        summary: `Upload a file for a ${entry.name} field`,
        description: 'Streams one file: the raw body with `name`, or `multipart/form-data` with one file part. Its type is detected from the content, corrected when the name or header says otherwise, and checked against the field\'s allowed types. The answer\'s `value` is a ticket: send it as the field\'s value in a create, update or batch write within 24 hours.',
        parameters: [{ ...field('The file field'), schema: { type: 'string', enum: fields } }, query('name', 'The file name, for a raw body')],
        requestBody: { required: true, content: { 'application/octet-stream': { schema: binary }, 'multipart/form-data': { schema: { type: 'object', properties: { file: binary } } } } },
        responses: {
          201: {
            description: 'Stored; use `value` in a write',
            content: json({
              type: 'object',
              required: ['value', 'file', 'derived'],
              properties: {
                value: { type: 'string' },
                file: { type: 'object', properties: { name: { type: 'string' }, type: { type: 'string' }, size: { type: 'integer' } } },
                derived: { type: 'object', description: 'Values the field\'s processors computed for its derived fields' },
                corrected: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } } },
              },
            }),
          },
          400: error('BadRequest'), ...auth, 403: error('Forbidden'),
          413: { description: 'Larger than the field allows' },
          415: { description: 'A type the field does not allow' },
        },
      },
    },
  }
}
