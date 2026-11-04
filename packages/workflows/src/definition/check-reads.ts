import { expressionReads } from './reads'
import { parse } from './expressions'
import { inputVariable } from './names'
import type { ExpressionPlace } from './expression-fields'

// What `$states` holds at each place: the Task's result after it ran, the error a catcher caught.
const statesFields: Record<ExpressionPlace, string> = { state: '', result: 'result', error: 'errorOutput' }

/**
 * Why an expression breaks the named-reads profile, if it does: it must parse, read no implicit input, read
 * `$states.input` only in the first state of a Map's item processor, and read only variables some state in its scope
 * assigns, or `$trigger`.
 */
export const readProblems = (source: string, { place, visible, firstOfItem }: { place: ExpressionPlace; visible: ReadonlySet<string>; firstOfItem: boolean }) => {
  const parsed = parse(source)
  if ('error' in parsed) return [`does not parse: ${parsed.error.message}${parsed.error.position === undefined ? '' : ` (at character ${parsed.error.position})`}`]
  const reads = expressionReads(parsed.expression)
  const problems: string[] = []
  if (reads.input) problems.push(`reads the state's input; read the run's input as $${inputVariable} and an earlier result by the variable a state assigned it to`)
  for (const field of reads.states) {
    if (field === 'input' && firstOfItem) continue
    if (field !== '' && field === statesFields[place]) continue
    if (field === 'input') problems.push('reads $states.input, which only the first state of a Map\'s item processor may read (as the item)')
    else if (field === '') problems.push('reads $states as a whole; read one of its fields')
    else problems.push(`reads $states.${field}, which is not there${place === 'state' ? '' : ` (here: $states.${statesFields[place]})`}`)
  }
  for (const name of reads.variables) if (!visible.has(name)) problems.push(`reads $${name}, which no state assigns in this scope`)
  if (/\$eval\s*\(/.test(source)) problems.push('calls $eval, whose reads cannot be checked')
  return problems
}
