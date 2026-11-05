import { limits } from '../limits'

const expression = { type: 'string', pattern: '^\\{%[\\s\\S]*%\\}$' }
const name = { type: 'string', minLength: 1, maxLength: 80 }
const errorNames = { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } }
const assign = { type: 'object', propertyNames: { pattern: '^[A-Za-z][A-Za-z0-9_]*$' } }
const common = { Type: {}, Comment: { type: 'string' }, Output: {}, Assign: assign, QueryLanguage: { const: 'JSONata' } }
const flow = { Next: name, End: { const: true } }
const nextOrEnd = { oneOf: [{ required: ['Next'], not: { required: ['End'] } }, { required: ['End'], not: { required: ['Next'] } }] }

const retrier = {
  type: 'object',
  additionalProperties: false,
  required: ['ErrorEquals'],
  properties: {
    ErrorEquals: errorNames,
    IntervalSeconds: { type: 'integer', minimum: 1, maximum: limits.retryDelaySeconds },
    MaxAttempts: { type: 'integer', minimum: 0, maximum: limits.retryAttempts },
    BackoffRate: { type: 'number', minimum: 1, maximum: 10 },
    MaxDelaySeconds: { type: 'integer', minimum: 1, maximum: limits.retryDelaySeconds },
  },
}
const catcher = { type: 'object', additionalProperties: false, required: ['ErrorEquals', 'Next'], properties: { ErrorEquals: errorNames, Next: name, Output: {}, Assign: assign } }
const recovery = { Retry: { type: 'array', items: retrier }, Catch: { type: 'array', items: catcher } }

const state = (type: string, properties: Record<string, unknown>, { required = [], ...extra }: { required?: string[]; [key: string]: unknown } = {}) => ({
  type: 'object',
  additionalProperties: false,
  required: ['Type', ...required],
  ...extra,
  properties: { ...common, Type: { const: type }, ...properties },
})

/**
 * The JSON Schema of a workflow definition: its trigger, and a state machine in the States Language with JSONata
 * expressions, in the named-reads profile. It checks the shape; `checkDefinition` also checks the edges and what each expression reads.
 */
export const definitionSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://docs.protobase.net/schemas/workflow-definition.json',
  $ref: '#/definitions/definition',
  definitions: {
    machine: {
      type: 'object',
      required: ['StartAt', 'States'],
      properties: {
        StartAt: name,
        Comment: { type: 'string' },
        States: { type: 'object', minProperties: 1, propertyNames: name, additionalProperties: { $ref: '#/definitions/state' } },
      },
    },
    definition: {
      type: 'object',
      additionalProperties: false,
      required: ['trigger', 'stateMachine'],
      properties: { trigger: { $ref: '#/definitions/trigger' }, stateMachine: { $ref: '#/definitions/stateMachine' }, trace: { enum: ['all', 'failed', 'none'] } },
    },
    trigger: {
      type: 'object',
      minProperties: 1,
      maxProperties: 1,
      additionalProperties: false,
      properties: {
        webhook: { type: 'object', additionalProperties: false },
        schedule: { type: 'object', additionalProperties: false, required: ['cron'], properties: { cron: { type: 'string' }, timezone: { type: 'string' } } },
        mail: { type: 'object', additionalProperties: false, required: ['mailbox'], properties: { mailbox: name } },
        record: {
          type: 'object',
          additionalProperties: false,
          required: ['events'],
          properties: { events: { type: 'array', minItems: 1, items: { type: 'string', pattern: '^[A-Za-z_][A-Za-z0-9_]*\\.[A-Za-z_][A-Za-z0-9_]*$' } } },
        },
        manual: { type: 'object', additionalProperties: false },
      },
    },
    stateMachine: {
      allOf: [{ $ref: '#/definitions/machine' }],
      required: ['QueryLanguage'],
      properties: { QueryLanguage: { const: 'JSONata' }, StartAt: {}, States: {}, Comment: {} },
      additionalProperties: false,
    },
    processor: {
      allOf: [{ $ref: '#/definitions/machine' }],
      properties: { ProcessorConfig: { type: 'object', additionalProperties: false, properties: { Mode: { const: 'INLINE' } } }, StartAt: {}, States: {}, Comment: {} },
      additionalProperties: false,
    },
    state: {
      type: 'object',
      required: ['Type'],
      discriminator: { propertyName: 'Type' },
      oneOf: [
        state('Pass', flow, nextOrEnd),
        state('Task', { ...flow, ...recovery, Resource: name, Arguments: {}, TimeoutSeconds: { type: 'integer', minimum: 1, maximum: limits.taskTimeoutSeconds }, DoNotRepeat: { type: 'boolean' } }, { required: ['Resource'], ...nextOrEnd }),
        state('Choice', {
          Choices: {
            type: 'array',
            minItems: 1,
            items: { type: 'object', additionalProperties: false, required: ['Condition', 'Next'], properties: { Condition: expression, Next: name, Comment: { type: 'string' }, Output: {}, Assign: assign } },
          },
          Default: name,
        }, { required: ['Choices'] }),
        state('Wait', { ...flow, Seconds: { anyOf: [{ type: 'integer', minimum: 0, maximum: limits.waitSeconds }, expression] }, Timestamp: { type: 'string' } }, {
          allOf: [nextOrEnd, { oneOf: [{ required: ['Seconds'] }, { required: ['Timestamp'] }] }],
        }),
        { type: 'object', additionalProperties: false, required: ['Type'], properties: { Type: { const: 'Succeed' }, Comment: { type: 'string' }, Output: {}, QueryLanguage: { const: 'JSONata' } } },
        // Fail ends the run with an error, so it has no Output or Assign.
        { type: 'object', additionalProperties: false, required: ['Type'], properties: { Type: { const: 'Fail' }, Comment: { type: 'string' }, QueryLanguage: { const: 'JSONata' }, Error: { type: 'string' }, Cause: { type: 'string' } } },
        state('Map', {
          ...flow,
          ...recovery,
          Items: {},
          ItemProcessor: { $ref: '#/definitions/processor' },
          MaxConcurrency: { type: 'integer', minimum: 0, maximum: limits.mapConcurrency },
        }, { required: ['ItemProcessor', 'Items'], ...nextOrEnd }),
      ],
    },
  },
} as const
