import { StepError, type StepContext, type StepType } from '@protobase/workflows/plugin'

const resource = { type: 'string', minLength: 1, description: "the resource's name, as list_resources gives it" }
const key = { description: "the record's key", anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'array', items: { type: ['string', 'number'] } }] }
const fieldValues = { type: 'object', description: 'an object of field values' }
const errors = { Refused: 'the API refused it, its status and message in the cause', InvalidArguments: 'an argument has the wrong type, named in the cause' }

type Key = string | number | (string | number)[]

const step = (label: string, description: string, input: Record<string, unknown>, output: string, run: (context: StepContext) => Promise<unknown>): StepType => ({
  label,
  description,
  errorPrefix: 'Records',
  input: { type: 'object', ...input },
  output: { description: output },
  errors,
  run,
})

const listOf = (data: unknown) => {
  if (!Array.isArray(data)) return
  return data.map((item, index) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) throw new StepError('Records.InvalidArguments', `data[${index}] must be an object of field values`)
    return item as Record<string, unknown>
  })
}

/**
 * The `app:records.*` steps: create, update, get and list through the app's API as the user who saved the version the
 * run runs, so its access rules, tenant scope, validation and write hooks apply as they do to that user's requests.
 */
export const recordsSteps: Record<string, StepType> = {
  'records.create': step(
    'Create records',
    "Creates records of the app's resources, as the workflow's last editor.",
    { required: ['resource', 'data'], properties: { resource, data: { description: 'an object of field values, or a list of them, created in one batch: all or none', anyOf: [fieldValues, { type: 'array', items: fieldValues }] } } },
    'the created record, or the list of them',
    async ({ input, records }) => {
      const many = listOf(input.data)
      // Several records are created in one batch, all or none, so a retry after one fails does not create the others again.
      if (many) return records.createMany(input.resource as string, many)
      return records.create(input.resource as string, input.data as Record<string, unknown>)
    },
  ),
  'records.update': step(
    'Update a record',
    "Updates one record, as the workflow's last editor.",
    { required: ['resource', 'key', 'data'], properties: { resource, key, data: { ...fieldValues, description: 'an object of the field values to change' } } },
    'the updated record',
    async ({ input, records }) => records.update(input.resource as string, input.key as Key, input.data as Record<string, unknown>),
  ),
  'records.get': step(
    'Get a record',
    "Reads one record, as the workflow's last editor.",
    { required: ['resource', 'key'], properties: { resource, key } },
    'the record',
    async ({ input, records }) => records.get(input.resource as string, input.key as Key),
  ),
  'records.list': step(
    'List records',
    "Lists records, as the workflow's last editor.",
    {
      required: ['resource'],
      properties: {
        resource,
        filter: { type: 'string', description: 'a filter in the API\'s syntax, such as status = "open"' },
        order_by: { type: 'string', description: 'such as "created_at desc"' },
        limit: { type: 'integer', minimum: 1, description: 'how many at most' },
      },
    },
    '{ records }',
    async ({ input, records }) => ({
      records: await records.list(input.resource as string, {
        ...(input.filter !== undefined && { filter: input.filter as string }),
        ...(input.order_by !== undefined && { order_by: input.order_by as string }),
        ...(input.limit !== undefined && { limit: input.limit as number }),
      }),
    }),
  ),
}
