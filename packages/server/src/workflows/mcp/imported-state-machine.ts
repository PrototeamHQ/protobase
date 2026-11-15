import { httpImportProblems, isHttpInvoke } from '@protobase/workflows'

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

// Step Functions' HTTP task's arguments as app:http takes them; its EventBridge connection has no counterpart here. Its
// RequestBody is sent as JSON whatever it holds, a text included, as app:http does with body_encoding json.
const httpArguments = (args: unknown) => {
  if (!isObject(args)) return args
  const { ApiEndpoint, Method, Headers, QueryParameters, RequestBody } = args
  return {
    url: ApiEndpoint,
    ...(Method !== undefined && { method: Method }),
    ...(Headers !== undefined && { headers: Headers }),
    ...(QueryParameters !== undefined && { query: QueryParameters }),
    ...(RequestBody !== undefined && { body: RequestBody, body_encoding: 'json' }),
  }
}

const importedStates = (states: unknown): unknown => {
  if (!isObject(states)) return states
  return Object.fromEntries(
    Object.entries(states).map(([name, state]) => {
      if (!isObject(state)) return [name, state]
      const inner = { ...state }
      // One holding what app:http cannot do the same way stays as it is, which the save check refuses by name
      if (inner.Type === 'Task' && isHttpInvoke(inner.Resource) && httpImportProblems(inner).length === 0) Object.assign(inner, { Resource: 'app:http', Arguments: httpArguments(inner.Arguments) })
      for (const machine of ['ItemProcessor', 'Processor', 'Iterator']) if (isObject(inner[machine])) inner[machine] = { ...inner[machine], States: importedStates((inner[machine] as Record<string, unknown>).States) }
      return [name, inner]
    }),
  )
}

/**
 * A state machine as Step Functions exports it, made to run here: its HTTP tasks become `app:http` steps, their
 * `ApiEndpoint`, `Method`, `Headers`, `QueryParameters` and `RequestBody` its `url`, `method`, `headers`, `query` and
 * `body`. Everything else stays as it is, an HTTP task with an argument app:http does not take or a retrier or catcher
 * of a status's own error included, so what this app does not run is refused by name when it is saved.
 */
export const importedStateMachine = (machine: Record<string, unknown>) => ({ ...machine, States: importedStates(machine.States) })
