import { importStateMachine, type ConnectionHeaders, type Problem } from '@protobase/workflows'
import { objectOf } from './workflow-tool-args'

export const connectionHeadersParameter = {
  type: 'object',
  description:
    'For a state machine from Step Functions: the header each HTTP task\'s connection sends here, by the connection\'s ARN, as { "<ARN>": { "header": "Authorization", "secret": "<NAME>" } }, the secret, one workflows.secrets lists, holding the header\'s whole value, such as "Bearer ..."; null sends none. Not saved: the imported steps read the secret in their headers.',
  additionalProperties: { type: ['object', 'null'], properties: { header: { type: 'string' }, secret: { type: 'string' } } },
}

/**
 * The definition fields with their state machine imported, each HTTP task from Step Functions as an app:http step,
 * with the connection headers the call gives, or the problems that keep it from importing exactly.
 */
export const importedFields = (fields: Record<string, unknown>, args: Record<string, unknown>): { fields: Record<string, unknown>; problems: Problem[] } => {
  const machine = objectOf(fields.state_machine)
  if (!machine) return { fields, problems: [] }
  const { stateMachine, problems } = importStateMachine(machine, (objectOf(args.connection_headers) ?? {}) as ConnectionHeaders)
  return { fields: { ...fields, state_machine: stateMachine }, problems }
}
