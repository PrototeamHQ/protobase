const httpInvoke = 'arn:aws:states:::http:invoke'

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

// Step Functions' HTTP task's arguments as app:http takes them; its EventBridge connection has no counterpart here.
const httpArguments = (args: unknown) => {
  if (!isObject(args)) return args
  const { ApiEndpoint, Method, Headers, QueryParameters, RequestBody } = args
  return {
    url: ApiEndpoint,
    ...(Method !== undefined && { method: Method }),
    ...(Headers !== undefined && { headers: Headers }),
    ...(QueryParameters !== undefined && { query: QueryParameters }),
    ...(RequestBody !== undefined && { body: RequestBody }),
  }
}

const importedStates = (states: unknown): unknown => {
  if (!isObject(states)) return states
  return Object.fromEntries(
    Object.entries(states).map(([name, state]) => {
      if (!isObject(state)) return [name, state]
      const inner = { ...state }
      if (inner.Type === 'Task' && inner.Resource === httpInvoke) Object.assign(inner, { Resource: 'app:http', Arguments: httpArguments(inner.Arguments) })
      for (const machine of ['ItemProcessor', 'Processor', 'Iterator']) if (isObject(inner[machine])) inner[machine] = { ...inner[machine], States: importedStates((inner[machine] as Record<string, unknown>).States) }
      return [name, inner]
    }),
  )
}

/**
 * A state machine as Step Functions exports it, made to run here: its HTTP tasks become `app:http` steps, their
 * `ApiEndpoint`, `Method`, `Headers`, `QueryParameters` and `RequestBody` its `url`, `method`, `headers`, `query` and
 * `body`. Everything else stays as it is, so what this app does not run is refused by name when it is saved.
 */
export const importedStateMachine = (machine: Record<string, unknown>) => ({ ...machine, States: importedStates(machine.States) })
