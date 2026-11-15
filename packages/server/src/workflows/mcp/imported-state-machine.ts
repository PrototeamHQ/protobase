import { expressionSource, httpImportProblems, isHttpInvoke } from '@protobase/workflows'

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

// Step Functions sends RequestBody as JSON, a text included, quotes and all, where app:http sends a text as it is and
// anything else as JSON. So a text, or an expression that may give one, becomes its JSON text, sent as JSON unless the
// task's headers say otherwise.
const jsonText = (body: string) => {
  const source = expressionSource(body)
  if (source === undefined) return JSON.stringify(body)
  return `{% ($body := (${source.trim()}); $json := $string([$body]); $substring($json, 1, $length($json) - 2)) %}`
}

const jsonHeaders = (headers: unknown) => {
  if (headers !== undefined && !isObject(headers)) return headers
  const given = headers ?? {}
  return Object.keys(given).some((name) => name.toLowerCase() === 'content-type') ? given : { ...given, 'Content-Type': 'application/json' }
}

// Step Functions' HTTP task's arguments as app:http takes them; its EventBridge connection has no counterpart here.
const httpArguments = (args: unknown) => {
  if (!isObject(args)) return args
  const { ApiEndpoint, Method, Headers, QueryParameters, RequestBody } = args
  const text = typeof RequestBody === 'string'
  const headers = text ? jsonHeaders(Headers) : Headers
  return {
    url: ApiEndpoint,
    ...(Method !== undefined && { method: Method }),
    ...(headers !== undefined && { headers }),
    ...(QueryParameters !== undefined && { query: QueryParameters }),
    ...(RequestBody !== undefined && { body: text ? jsonText(RequestBody) : RequestBody }),
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
