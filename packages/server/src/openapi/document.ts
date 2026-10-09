import type { RequestAccess } from '../request-access'
import { batchSchemas, errorResponses, parameters, problemSchema, searchBody } from './components'
import { resourcePaths } from './resource-paths'
import { resourceSchemas } from './schemas'

/** The OpenAPI 3.1 document for one caller, generated from the resource models they may see and their zod record schemas. */
export const openApiDocument = (accesses: RequestAccess[], basePath: string, systemPath: string) => ({
  openapi: '3.1.0',
  info: {
    title: 'Protobase API',
    version: '1.0.0',
    description: 'Admin API for an existing Postgres database. Follows Google\'s API design conventions ([AIP](https://google.aip.dev)) and reports errors as RFC 9457 `application/problem+json`.',
  },
  servers: [{ url: basePath }],
  security: [{ bearer: [] }],
  tags: accesses.map(({ entry }) => ({ name: entry.name })),
  paths: {
    '/meta': {
      servers: [{ url: systemPath || '/' }],
      get: {
        operationId: 'get_meta',
        summary: 'Resource and view models',
        description: 'ETag from a content hash; send If-None-Match for a 304.',
        responses: { 200: { description: 'The models' }, 304: { description: 'Not modified' }, 401: { $ref: '#/components/responses/Unauthorized' } },
      },
    },
    [`/${basePath.slice(basePath.lastIndexOf('/') + 1)}:batchWrite`]: {
      servers: [{ url: basePath.slice(0, basePath.lastIndexOf('/')) || '/' }],
      post: {
        operationId: 'batch_write',
        summary: 'Write many records in one transaction',
        description: 'Ordered create, update, delete and reorder operations, at most 500, across resources. Each runs through the normal write pipeline (validation, access with row filters and record rules, tenant, ETags, hooks); the first failure rolls everything back and the problem names it in `operation` (its index), `op` and `resource`. A stale ETag is a 412 for the whole batch. `reorder` moves only the records that change, first out of the way (above the highest value in the column, or below the lowest when a check constraint refuses that), so a unique index such as (invoice_id, position) is never violated half way. `{ "$ref": name }` points at a record created earlier by `ref`.',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/BatchRequest' } } } },
        responses: {
          200: { description: 'Every result, in order', content: { 'application/json': { schema: { $ref: '#/components/schemas/BatchResponse' } } } },
          400: { $ref: '#/components/responses/BadRequest' }, 401: { $ref: '#/components/responses/Unauthorized' }, 403: { $ref: '#/components/responses/Forbidden' },
          404: { $ref: '#/components/responses/NotFound' }, 409: { $ref: '#/components/responses/Conflict' }, 412: { $ref: '#/components/responses/PreconditionFailed' }, 428: { $ref: '#/components/responses/PreconditionRequired' },
        },
      },
    },
    ...Object.assign({}, ...accesses.map(resourcePaths)),
  },
  components: {
    securitySchemes: { bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    parameters,
    responses: errorResponses,
    schemas: { Problem: problemSchema, SearchBody: searchBody, ...batchSchemas, ...Object.assign({}, ...accesses.map(resourceSchemas)) },
  },
})
