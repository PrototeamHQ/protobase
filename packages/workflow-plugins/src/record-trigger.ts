import type { ReadyTrigger } from '@protobase/workflows/plugin'

// A resource or field name: a resource takes any name, such as purchase-orders, and the save checks that it exists.
const name = { type: 'string', minLength: 1 }

/**
 * `app:record`: one run per record of `resource` that becomes ready, as `when` says, with the record as the run's input.
 * Without `when`, every record is ready once it exists, so each new record starts one run.
 */
export const recordTriggers: Record<string, ReadyTrigger> = {
  record: {
    kind: 'ready',
    label: 'Record ready',
    description: 'Starts one run for each record that becomes ready, at once or when a time in it comes, once per ready key.',
    input: {
      type: 'object',
      additionalProperties: false,
      required: ['resource'],
      properties: {
        resource: { ...name, description: "the resource's name, as list_resources gives it" },
        when: { type: 'string', minLength: 1, description: "a filter on indexed fields, such as status = 'sent' and due_at <= now() - 3d; without it every record is ready" },
        key: { type: 'array', items: name, description: 'fields whose new value makes a record ready again, such as due_at' },
      },
    },
    output: { type: 'object', description: '{ resource, key, record }: the record as the workflow\'s last editor reads it' },
    ready: (input) => ({ resource: input.resource as string, ...(input.when !== undefined && { when: input.when as string }), ...(input.key !== undefined && { key: input.key as string[] }) }),
  },
}
