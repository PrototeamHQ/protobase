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
  Credentials: 'does not run here: a step signs in through the connection its type declares',
}

const stateProblems = (states: unknown, path: string[]): Problem[] => {
  if (!isObject(states)) return []
  return Object.entries(states).flatMap(([name, state]): Problem[] => {
    if (!isObject(state)) return []
    const where = [...path, name].join('/')
    const found: Problem[] = []
    if (state.Type === 'Parallel') found.push({ state: where, field: 'Type', message: 'is Parallel, which does not run here yet; in data order, states that read nothing of each other run at once' })
    if (typeof state.Resource === 'string' && state.Resource.startsWith('arn:')) {
      found.push({ state: where, field: 'Resource', message: `is a Step Functions service (${state.Resource}), which does not run here: write the step with one of this app's step types, such as app:http for an HTTP request` })
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
 * language by default), its service tasks, the HTTP task included, Parallel, a distributed Map, credentials and a whole-run
 * timeout. Empty for a machine this app can check further.
 */
export const awsProblems = (definition: unknown): Problem[] => {
  const machine = isObject(definition) && isObject(definition.stateMachine) ? definition.stateMachine : undefined
  if (!machine) return []
  const found: Problem[] = []
  if (machine.QueryLanguage !== 'JSONata') found.push({ field: 'stateMachine.QueryLanguage', message: `is ${machine.QueryLanguage === undefined ? 'missing, so the machine is JSONPath, the default of Step Functions' : JSON.stringify(machine.QueryLanguage)}; only JSONata machines run here: set "QueryLanguage": "JSONata" and write its states in JSONata` })
  if (machine.TimeoutSeconds !== undefined) found.push({ field: 'stateMachine.TimeoutSeconds', message: "is a whole run's timeout, which does not run here; give each Task its TimeoutSeconds" })
  return [...found, ...stateProblems(machine.States, [])]
}
