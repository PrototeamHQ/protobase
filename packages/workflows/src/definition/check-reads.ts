import { expressionReads } from './reads'
import { parse } from './expressions'
import { contextReads } from './names'
import type { ExpressionPlace } from './expression-fields'
import { limits } from '../limits'

// What `$states` holds at each place beside its context: the Task's or Map's result after it ran, the error a catcher caught.
const statesFields: Record<ExpressionPlace, string> = { state: '', result: 'result', error: 'errorOutput' }

const startsWith = (path: readonly string[], prefix: readonly string[]) => prefix.every((name, index) => path[index] === name)

// Why a read of `$states.context` is refused: the input, the start time and a secret by name are all it holds.
const contextProblem = (path: readonly string[]) => {
  const rest = path.slice(1)
  if (startsWith(rest, ['Secrets'])) return rest.length >= 2 ? undefined : 'reads $states.context.Secrets as a whole; read one secret by its name, such as $states.context.Secrets.API_TOKEN'
  if (contextReads.some((read) => startsWith(rest, read))) return undefined
  return `reads $states.${path.join('.')}; $states.context holds only Execution.Input, Execution.StartTime and Secrets.<NAME>`
}

/** The reads of an expression, or undefined when it does not parse. */
export const expressionParsed = (source: string) => {
  const parsed = parse(source)
  return 'error' in parsed ? undefined : expressionReads(parsed.expression)
}

/**
 * Why an expression breaks the named-reads profile, if it does: it must parse, read no implicit input, read
 * `$states.input` only in the first state of a Map's item processor, read of `$states.context` only the run's input,
 * start time and secrets by name (inside a Block, not the start time), and read only variables a state that can run
 * before it assigns.
 */
export const readProblems = (source: string, { place, visible, firstOfItem, inBlock = false }: { place: ExpressionPlace; visible: ReadonlySet<string>; firstOfItem: boolean; inBlock?: boolean }) => {
  if (source.length > limits.expressionLength) return [`is ${source.length} characters long, more than the ${limits.expressionLength} an expression may be`]
  const parsed = parse(source)
  if ('error' in parsed) return [`does not parse: ${parsed.error.message}${parsed.error.position === undefined ? '' : ` (at character ${parsed.error.position})`}`]
  const reads = expressionReads(parsed.expression)
  const problems: string[] = []
  if (reads.input) problems.push("reads the state's input; read the run's input as $states.context.Execution.Input and an earlier result by the variable a state assigned it to")
  for (const path of reads.states) {
    const [field = ''] = path
    if (field === 'input' && firstOfItem) continue
    if (field !== '' && field === statesFields[place]) continue
    if (field === 'context' && inBlock && startsWith(path, ['context', 'Execution', 'StartTime'])) problems.push("reads $states.context.Execution.StartTime, which inside a Block is its own run's start, not part of what it is cached by")
    else if (field === 'context') {
      const problem = contextProblem(path)
      if (problem) problems.push(problem)
    } else if (field === 'input') problems.push("reads $states.input, which only the first state of a Map's item processor may read (as the item)")
    else if (field === '') problems.push('reads $states as a whole; read one of its fields')
    else problems.push(`reads $states.${field}, which is not there${place === 'state' ? '' : ` (here: $states.${statesFields[place]})`}`)
  }
  for (const name of reads.variables) if (!visible.has(name)) problems.push(`reads $${name}, which no state that can run before it assigns`)
  if (reads.evaluates) problems.push('uses $eval, whose reads cannot be checked')
  return [...new Set(problems)]
}
