import { limits } from '../limits'

const expression = { type: 'string', pattern: '^\\{%[\\s\\S]*%\\}$' }
const name = { type: 'string', minLength: 1, maxLength: 80 }
const errorNames = { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } }
const assign = { type: 'object', propertyNames: { pattern: '^[A-Za-z_][A-Za-z0-9_]*$' } }
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
 * The JSON Schema of a workflow definition: the States Language with JSONata expressions, in the named-reads profile.
 * It checks the shape; `checkDefinition` also checks the edges and what each expression reads.
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
      allOf: [{ $ref: '#/definitions/machine' }],
      required: ['QueryLanguage'],
      properties: { QueryLanguage: { const: 'JSONata' }, Version: { type: 'string' }, StartAt: {}, States: {}, Comment: {} },
      additionalProperties: false,
    },
    processor: {
      allOf: [{ $ref: '#/definitions/machine' }],
      properties: { ProcessorConfig: { type: 'object', additionalProperties: false, properties: { Mode: { const: 'INLINE' } } }, StartAt: {}, States: {}, Comment: {} },
      additionalProperties: false,
    },
    branch: { allOf: [{ $ref: '#/definitions/machine' }], properties: { StartAt: {}, States: {}, Comment: {} }, additionalProperties: false },
    state: {
      type: 'object',
      required: ['Type'],
      discriminator: { propertyName: 'Type' },
      oneOf: [
        state('Pass', flow, nextOrEnd),
        state('Task', { ...flow, ...recovery, Resource: name, Arguments: {}, TimeoutSeconds: { type: 'integer', minimum: 1, maximum: limits.taskTimeoutSeconds } }, { required: ['Resource'], ...nextOrEnd }),
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
        state('Succeed', {}),
        // Fail ends the run with an error, so it has no Output or Assign.
        { type: 'object', additionalProperties: false, required: ['Type'], properties: { Type: { const: 'Fail' }, Comment: { type: 'string' }, QueryLanguage: { const: 'JSONata' }, Error: { type: 'string' }, Cause: { type: 'string' } } },
        state('Map', {
          ...flow,
          ...recovery,
          Items: {},
          ItemProcessor: { $ref: '#/definitions/processor' },
          MaxConcurrency: { type: 'integer', minimum: 0, maximum: limits.mapConcurrency },
        }, { required: ['ItemProcessor', 'Items'], ...nextOrEnd }),
        state('Parallel', { ...flow, ...recovery, Arguments: {}, Branches: { type: 'array', minItems: 1, maxItems: limits.parallelBranches, items: { $ref: '#/definitions/branch' } } }, {
          required: ['Branches'],
          ...nextOrEnd,
        }),
      ],
    },
  },
} as const
