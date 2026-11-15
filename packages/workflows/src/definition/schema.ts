import { limits } from '../limits'
import type { Order } from './types'

const expression = { type: 'string', pattern: '^\\{%[\\s\\S]*%\\}$' }
const name = { type: 'string', minLength: 1, maxLength: 80 }
const errorNames = { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } }
const assign = { type: 'object', propertyNames: { pattern: '^[A-Za-z][A-Za-z0-9_]*$' } }

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

/**
 * The JSON Schema of a workflow definition in one order: its trigger, and a state machine in the States Language with
 * JSONata expressions, in the named-reads profile. In sequence order every state names its `Next` or `End` and the
 * machine its `StartAt`, as the States Language has them; in data order none does, a state may have a `Condition`,
 * a catcher has no `Next`, and there is no Choice or Succeed. It checks the shape; `checkDefinition` also checks the
 * edges and what each expression reads.
 */
const schemaFor = (order: Order) => {
  const sequence = order === 'sequence'
  const common = { Type: {}, Comment: { type: 'string' }, Output: {}, Assign: assign, QueryLanguage: { const: 'JSONata' }, ...(!sequence && { Condition: expression }) }
  const flow = sequence ? { Next: name, End: { const: true } } : {}
  const nextOrEnd = sequence ? { oneOf: [{ required: ['Next'], not: { required: ['End'] } }, { required: ['End'], not: { required: ['Next'] } }] } : {}
  const catcher = { type: 'object', additionalProperties: false, required: ['ErrorEquals', ...(sequence ? ['Next'] : [])], properties: { ErrorEquals: errorNames, ...(sequence && { Next: name }), Output: {}, Assign: assign } }
  const recovery = { Retry: { type: 'array', items: retrier }, Catch: { type: 'array', items: catcher } }
  const state = (type: string, properties: Record<string, unknown>, { required = [], ...extra }: { required?: string[]; [key: string]: unknown } = {}) => ({
    type: 'object',
    additionalProperties: false,
    required: ['Type', ...required],
    ...extra,
    properties: { ...common, Type: { const: type }, ...properties },
  })
  const machine = sequence
    ? { type: 'object', required: ['StartAt', 'States'], properties: { StartAt: name, Comment: { type: 'string' }, States: { type: 'object', minProperties: 1, propertyNames: name, additionalProperties: { $ref: '#/definitions/state' } } } }
    : { type: 'object', required: ['States'], properties: { Comment: { type: 'string' }, States: { type: 'object', minProperties: 1, propertyNames: name, additionalProperties: { $ref: '#/definitions/state' } } } }
  // A state machine Step Functions exports may carry its Version, which runs nothing
  const machineFields = { ...(sequence && { StartAt: {} }), States: {}, Comment: {}, Version: { type: 'string' } }
  const flowStates = [
    state('Pass', flow, nextOrEnd),
    state('Task', { ...flow, ...recovery, Resource: name, Arguments: {}, TimeoutSeconds: { type: 'integer', minimum: 1, maximum: limits.waitingTaskTimeoutSeconds }, HeartbeatSeconds: { type: 'integer', minimum: 1, maximum: limits.waitingTaskTimeoutSeconds }, Cache: { type: 'boolean' } }, { required: ['Resource'], ...nextOrEnd }),
    state('Wait', { ...flow, Seconds: { anyOf: [{ type: 'integer', minimum: 0, maximum: limits.waitSeconds }, expression] }, Timestamp: { type: 'string' } }, {
      allOf: [nextOrEnd, { oneOf: [{ required: ['Seconds'] }, { required: ['Timestamp'] }] }],
    }),
    // Fail ends the run with an error, so it has no Output or Assign.
    { type: 'object', additionalProperties: false, required: ['Type'], properties: { Type: { const: 'Fail' }, Comment: { type: 'string' }, QueryLanguage: { const: 'JSONata' }, ...(!sequence && { Condition: expression }), Error: { type: 'string' }, Cause: { type: 'string' } } },
    state('Map', {
      ...flow,
      ...recovery,
      Items: {},
      ItemProcessor: { $ref: '#/definitions/processor' },
      MaxConcurrency: { type: 'integer', minimum: 0, maximum: limits.mapConcurrency },
    }, { required: ['ItemProcessor', 'Items'], ...nextOrEnd }),
    state('Block', {
      ...flow,
      ...recovery,
      Arguments: {},
      Processor: { $ref: '#/definitions/machine' },
      // Ttl's text is checked by checkDefinition, as a step type's cache time to live is.
      Cache: { type: 'object', additionalProperties: false, required: ['Ttl'], properties: { Ttl: { type: ['integer', 'string'] }, Key: {} } },
    }, { required: ['Processor', 'Cache'], ...nextOrEnd }),
  ]
  // A Choice goes on by its rules and a Succeed ends the run: in data order a Condition and the run's end say both.
  const sequenceStates = sequence
    ? [
        state('Choice', {
          Choices: {
            type: 'array',
            minItems: 1,
            items: { type: 'object', additionalProperties: false, required: ['Condition', 'Next'], properties: { Condition: expression, Next: name, Comment: { type: 'string' }, Output: {}, Assign: assign } },
          },
          Default: name,
        }, { required: ['Choices'] }),
        { type: 'object', additionalProperties: false, required: ['Type'], properties: { Type: { const: 'Succeed' }, Comment: { type: 'string' }, Output: {}, QueryLanguage: { const: 'JSONata' } } },
      ]
    : []
  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: `https://docs.protobase.net/schemas/workflow-definition${sequence ? '' : '-data'}.json`,
    $ref: '#/definitions/definition',
    definitions: {
      machine,
      definition: {
        type: 'object',
        additionalProperties: false,
        required: ['trigger', 'stateMachine'],
        properties: { trigger: { $ref: '#/definitions/trigger' }, order: { enum: ['sequence', 'data'] }, stateMachine: { $ref: '#/definitions/stateMachine' }, connections: { $ref: '#/definitions/connections' }, trace: { enum: ['all', 'failed', 'none'] } },
      },
      // The account each connection `<plugin>:<connection>` the definition's types sign in with goes through, by its id.
      connections: {
        type: 'object',
        propertyNames: { pattern: '^[a-z][a-z0-9_]*:[a-z][a-z0-9_]*$' },
        additionalProperties: { type: 'string', minLength: 1, maxLength: 255 },
      },
      trigger: {
        type: 'object',
        minProperties: 1,
        maxProperties: 1,
        // `manual`, which takes no input, or a trigger type `<plugin>:<key>` with its input; the plugin's schema checks that.
        propertyNames: { pattern: '^(manual|[a-z][a-z0-9_]*:[a-z][a-z0-9_]*(\\.[a-z][a-z0-9_]*)*)$' },
        properties: { manual: { type: 'object', maxProperties: 0 } },
        additionalProperties: { type: 'object' },
      },
      stateMachine: {
        allOf: [{ $ref: '#/definitions/machine' }],
        required: ['QueryLanguage'],
        properties: { QueryLanguage: { const: 'JSONata' }, ...machineFields },
        additionalProperties: false,
      },
      processor: {
        allOf: [{ $ref: '#/definitions/machine' }],
        properties: { ProcessorConfig: { type: 'object', additionalProperties: false, properties: { Mode: { const: 'INLINE' } } }, ...machineFields },
        additionalProperties: false,
      },
      state: { type: 'object', required: ['Type'], discriminator: { propertyName: 'Type' }, oneOf: [...flowStates, ...sequenceStates] },
    },
  }
}

/** The JSON Schema of a workflow definition whose states run in sequence, the States Language's own order. */
export const definitionSchema = schemaFor('sequence')

/** The JSON Schema of a workflow definition whose states run in the order their reads give: `"order": "data"`. */
export const dataflowDefinitionSchema = schemaFor('data')
