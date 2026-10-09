const problemContent = { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } }

const problem = (description: string) => ({ description, content: problemContent })

export const problemSchema = {
  type: 'object',
  description: 'RFC 9457 problem details',
  required: ['type', 'title', 'status', 'detail'],
  properties: {
    type: { type: 'string', description: 'A URN naming the kind of problem' },
    title: { type: 'string' },
    status: { type: 'integer' },
    detail: { type: 'string' },
    instance: { type: 'string', description: 'The request path' },
    parameter: { type: 'string', description: 'For filter and order_by errors, the offending parameter' },
    errors: {
      type: 'array',
      description: 'Filter and order_by errors (code, message, hint, span) or field errors (field, code, message)',
      items: { type: 'object', additionalProperties: true },
    },
  },
  additionalProperties: true,
}

export const errorResponses = {
  BadRequest: problem('Invalid filter, order_by, parameter, key or body'),
  Unauthorized: problem('Missing or invalid credentials'),
  Forbidden: problem('The caller may not do this, or has no tenant'),
  NotFound: problem('No such resource or record, or the record belongs to another tenant'),
  PreconditionFailed: problem('If-Match no longer matches the record'),
  PreconditionRequired: problem('If-Match is required'),
  Conflict: problem('A unique or foreign key constraint rejected the write'),
}

const filterDescription = [
  'An [AIP-160](https://google.aip.dev/160) filter, for example `status = "confirmed" AND total > 100`.',
  'Only filterable fields can be used.',
  'Functions: `in(field, v1, v2, ...)`, `search("text")` (also bare words), `similar(field, "text")`, `regex(field, "pattern")`, `isNull(field)`, `now()` with a duration offset such as `now() - 7d`.',
  'Syntax errors come back as a problem with `errors` carrying spans and hints.',
].join(' ')

export const parameters = {
  filter: { name: 'filter', in: 'query', description: filterDescription, schema: { type: 'string' } },
  orderBy: {
    name: 'order_by',
    in: 'query',
    description: 'Comma separated sortable fields, each with an optional `desc`, as in [AIP-132](https://google.aip.dev/132#ordering): `createdAt desc, number`. The primary key breaks ties.',
    schema: { type: 'string' },
  },
  pageSize: {
    name: 'page_size',
    in: 'query',
    description: 'As in [AIP-158](https://google.aip.dev/158): default 50, maximum 500 (larger values are coerced).',
    schema: { type: 'integer', minimum: 0, maximum: 500 },
  },
  pageToken: { name: 'page_token', in: 'query', description: 'The `next_page_token` of the previous page', schema: { type: 'string' } },
  fields: { name: 'fields', in: 'query', description: 'Comma separated field names to return', schema: { type: 'string' } },
  count: { name: 'count', in: 'query', description: '`exact` adds `total_size`, a real count(*)', schema: { type: 'string', enum: ['exact'] } },
  key: {
    name: 'key',
    in: 'path',
    required: true,
    description: 'The primary key. Composite keys are comma separated parts, each percent-encoded.',
    schema: { type: 'string' },
  },
  ifMatch: { name: 'If-Match', in: 'header', required: true, description: 'The `etag` of the record, from a GET or a list item; `*` matches any version', schema: { type: 'string' } },
  ifMatchOptional: { name: 'If-Match', in: 'header', description: 'When sent, the operation only happens if it matches the current `etag` ([AIP-135](https://google.aip.dev/135)); `*` matches any version', schema: { type: 'string' } },
  showDeleted: { name: 'show_deleted', in: 'query', description: 'Also return soft-deleted records ([AIP-164](https://google.aip.dev/164)); only on resources that soft delete', schema: { type: 'boolean' } },
  prefer: { name: 'Prefer', in: 'header', description: '`return=minimal` or `return=representation` (default)', schema: { type: 'string' } },
}

export const searchBody = {
  type: 'object',
  description: 'The list parameters as JSON, for filters too long for a URL',
  properties: {
    filter: { type: 'string', description: parameters.filter.description },
    order_by: { type: 'string' },
    page_size: { type: 'integer' },
    page_token: { type: 'string' },
    fields: { type: 'array', items: { type: 'string' } },
    count: { type: 'string', enum: ['exact'] },
    show_deleted: { type: 'boolean', description: 'Soft-delete resources only' },
  },
}

const refSchema = {
  type: 'object',
  description: 'Points at a record created earlier in the batch by its `ref` name: in a key it stands for that record\'s key, in `data` for its key (or, with `field`, that field\'s value)',
  required: ['$ref'],
  // `properties` would need a key named $ref, which JSON Schema tooling reads as a reference
  additionalProperties: { type: 'string' },
}
const keySchema = {
  description: 'A record key: its text as in a URL (`a,b` when composite), a number, a list of parts, or a `$ref`',
  anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'array', items: { anyOf: [{ type: 'string' }, { type: 'number' }, { $ref: '#/components/schemas/BatchRef' }] } }, { $ref: '#/components/schemas/BatchRef' }],
}

export const batchSchemas = {
  BatchRef: refSchema,
  BatchKey: keySchema,
  BatchRequest: {
    type: 'object',
    required: ['ops'],
    properties: {
      ops: {
        type: 'array',
        minItems: 1,
        maxItems: 500,
        description: 'Run in order inside one transaction through the normal write pipeline; all or nothing',
        items: {
          oneOf: [
            { type: 'object', required: ['op', 'resource', 'data'], properties: { op: { const: 'create' }, resource: { type: 'string' }, data: { type: 'object', additionalProperties: true }, ref: { type: 'string', description: 'Names the created record for later `$ref`s' } }, additionalProperties: false },
            { type: 'object', required: ['op', 'resource', 'key', 'data'], properties: { op: { const: 'update' }, resource: { type: 'string' }, key: { $ref: '#/components/schemas/BatchKey' }, etag: { type: 'string', description: 'Required, as `If-Match` on a single update; `*` matches any version' }, data: { type: 'object', additionalProperties: true } }, additionalProperties: false },
            { type: 'object', required: ['op', 'resource', 'key'], properties: { op: { const: 'delete' }, resource: { type: 'string' }, key: { $ref: '#/components/schemas/BatchKey' }, etag: { type: 'string', description: 'Optional, as `If-Match` on a single delete' } }, additionalProperties: false },
            {
              type: 'object',
              required: ['op', 'resource', 'field', 'keys'],
              properties: {
                op: { const: 'reorder' },
                resource: { type: 'string' },
                field: { type: 'string', description: 'An integer field the caller may write, for example `position`' },
                keys: { type: 'array', minItems: 1, items: { $ref: '#/components/schemas/BatchKey' }, description: 'The records in their final order: `field` becomes 1, 2, 3, ...' },
                etags: { type: 'object', additionalProperties: { type: 'string' }, description: 'ETag per key (the key as text) for every record whose value changes' },
              },
              additionalProperties: false,
            },
          ],
        },
      },
    },
  },
  BatchResponse: {
    type: 'object',
    required: ['results'],
    properties: {
      results: {
        type: 'array',
        description: 'One result per operation, in order: records come with their new `etag`',
        items: { type: 'object', required: ['op', 'resource'], properties: { op: { type: 'string', enum: ['create', 'update', 'delete', 'reorder'] }, resource: { type: 'string' }, ref: { type: 'string' }, record: { type: 'object', additionalProperties: true }, etag: { type: 'string' }, deleted: { type: 'boolean' }, records: { type: 'array', items: { type: 'object', properties: { record: { type: 'object', additionalProperties: true }, etag: { type: 'string' } } } } } },
      },
    },
  },
}
