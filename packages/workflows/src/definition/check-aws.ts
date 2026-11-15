import type { Problem } from './problem'

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

// The fields of the States Language's JSONPath, which the named-reads profile writes in JSONata as Arguments, Output and Assign
const jsonPathFields = ['InputPath', 'Parameters', 'ResultSelector', 'ResultPath', 'OutputPath', 'ItemsPath']
// What Step Functions runs that this app does not, by field
const awsFields: Record<string, string> = {
  ItemReader: "is a distributed Map's reader, which does not run here; give the Map its Items",
  ItemBatcher: "is a distributed Map's batcher, which does not run here",
  ResultWriter: "is a distributed Map's writer, which does not run here",
  ToleratedFailureCount: "is a distributed Map's, which does not run here",
  ToleratedFailurePercentage: "is a distributed Map's, which does not run here",
  HeartbeatSeconds: 'does not run here: a step type ends or fails within its TimeoutSeconds',
  Credentials: 'does not run here: a step signs in through the connection its type declares',
}

/** Step Functions' HTTP task, which imports as app:http; one that waits for a task token is a service integration pattern this app does not run. */
export const httpInvoke = 'arn:aws:states:::http:invoke'
export const isHttpInvoke = (resource: unknown) => resource === httpInvoke

// The HTTP task's arguments the import carries over, or, for its connection, leaves out
const httpArgumentNames = new Set(['ApiEndpoint', 'Method', 'Headers', 'QueryParameters', 'RequestBody', 'Authentication', 'InvocationConfig'])

/**
 * What an HTTP task of Step Functions holds that app:http cannot do the same way, each named: Arguments that are one
 * expression, an argument it does not carry over, such as `Transform`, which encodes the body otherwise, and a retrier or catcher of a status's own error
 * (`States.Http.StatusCode.<code>`), as app:http fails with `Http.Status` for every status. Empty for one that imports.
 */
export const httpImportProblems = (state: Record<string, unknown>): Omit<Problem, 'state'>[] => {
  // One expression gives its argument names only when it runs, so they cannot be carried over
  if (typeof state.Arguments === 'string') return [{ field: 'Arguments', message: "is one expression, whose argument names the import cannot carry over to app:http's; write ApiEndpoint, Method, Headers, QueryParameters and RequestBody as fields, each of which may be an expression" }]
  const args = isObject(state.Arguments) ? state.Arguments : {}
  const found: Omit<Problem, 'state'>[] = Object.keys(args)
    .filter((name) => !httpArgumentNames.has(name))
    .map((name) => ({ field: `Arguments.${name}`, message: `is an HTTP task's ${name}, which does not import: app:http takes only ApiEndpoint, Method, Headers, QueryParameters and RequestBody` }))
  for (const field of ['Retry', 'Catch'] as const) {
    const rules = Array.isArray(state[field]) ? (state[field] as unknown[]) : []
    rules.forEach((rule, index) => {
      const names = isObject(rule) && Array.isArray(rule.ErrorEquals) ? rule.ErrorEquals : []
      for (const name of names) {
        if (typeof name === 'string' && name.startsWith('States.Http.StatusCode.')) found.push({ field: `${field}[${index}].ErrorEquals`, message: `names ${name}, a status's own error, which does not import: app:http fails with Http.Status for every status, which its error's cause names` })
      }
    })
  }
  return found
}

const stateProblems = (states: unknown, path: string[]): Problem[] => {
  if (!isObject(states)) return []
  return Object.entries(states).flatMap(([name, state]): Problem[] => {
    if (!isObject(state)) return []
    const where = [...path, name].join('/')
    const found: Problem[] = []
    if (state.Type === 'Parallel') found.push({ state: where, field: 'Type', message: 'is Parallel, which does not run here yet; in data order, states that read nothing of each other run at once' })
    if (isHttpInvoke(state.Resource)) {
      const http = httpImportProblems(state)
      // One that would import is written as app:http where no import converts it, such as a save through the API
      if (http.length === 0) found.push({ state: where, field: 'Resource', message: "is Step Functions' HTTP task, which create_workflow and update_workflow import as app:http; write app:http here" })
      found.push(...http.map((problem) => ({ state: where, ...problem })))
    } else if (typeof state.Resource === 'string' && state.Resource.startsWith('arn:')) {
      found.push({ state: where, field: 'Resource', message: `is a Step Functions service (${state.Resource}), which does not run here; of them, only the HTTP task (arn:aws:states:::http:invoke) imports, as app:http` })
    }
    for (const field of jsonPathFields) if (state[field] !== undefined) found.push({ state: where, field, message: 'is JSONPath, which does not run here; write the state in JSONata, with Arguments, Output and Assign' })
    for (const [field, message] of Object.entries(awsFields)) if (state[field] !== undefined) found.push({ state: where, field, message })
    const config = isObject(state.ItemProcessor) ? state.ItemProcessor.ProcessorConfig : undefined
    if (isObject(config) && config.Mode === 'DISTRIBUTED') found.push({ state: where, field: 'ItemProcessor.ProcessorConfig.Mode', message: 'is DISTRIBUTED, which does not run here; a Map runs its items inline' })
    for (const inner of ['ItemProcessor', 'Processor', 'Iterator']) if (isObject(state[inner])) found.push(...stateProblems((state[inner] as Record<string, unknown>).States, [...path, name]))
    return found
  })
}

/**
 * What a state machine from Step Functions holds that this app does not run, each named: JSONPath (its query
 * language by default), its service tasks but the HTTP one, Parallel, a distributed Map, heartbeats, credentials and a
 * whole-run timeout. Empty for a machine this app can check further.
 */
export const awsProblems = (definition: unknown): Problem[] => {
  const machine = isObject(definition) && isObject(definition.stateMachine) ? definition.stateMachine : undefined
  if (!machine) return []
  const found: Problem[] = []
  if (machine.QueryLanguage !== 'JSONata') found.push({ field: 'stateMachine.QueryLanguage', message: `is ${machine.QueryLanguage === undefined ? 'missing, so the machine is JSONPath, the default of Step Functions' : JSON.stringify(machine.QueryLanguage)}; only JSONata machines run here: set "QueryLanguage": "JSONata" and write its states in JSONata` })
  if (machine.TimeoutSeconds !== undefined) found.push({ field: 'stateMachine.TimeoutSeconds', message: "is a whole run's timeout, which does not run here; give each Task its TimeoutSeconds" })
  return [...found, ...stateProblems(machine.States, [])]
}
