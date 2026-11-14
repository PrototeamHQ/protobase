import { expressionSource } from '../expressions'

/** Where a read starts: the run's input, a variable a state assigns, or in data order a state's status by its name. */
export type ReadBase = { input: true } | { variable: string } | { step: string }

/** A value that is one read by name and nothing else: where it starts, and the fields it goes down. */
export type Reference = { base: ReadBase; path: string[] }

const inputRead = '$states.context.Execution.Input'
const stepsRead = '$states.context.Steps'
const plainKey = /^[A-Za-z_][A-Za-z0-9_]*$/
const segment = /^\.(?:([A-Za-z_][A-Za-z0-9_]*)|`([^`]+)`)/

const pathOf = (rest: string): string[] | undefined => {
  const path: string[] = []
  let left = rest
  while (left !== '') {
    const match = segment.exec(left)
    if (!match) return
    path.push(match[1] ?? match[2]!)
    left = left.slice(match[0].length)
  }
  return path
}

/**
 * The read a value is, when it is an expression of one read by name, such as `{% $fetch.body.ip %}` or
 * `{% $states.context.Execution.Input.record.name %}`; undefined for any other value, such as text, an expression that
 * computes, or `$states.result`.
 */
export const parseReference = (value: unknown): Reference | undefined => {
  const source = expressionSource(value)?.trim()
  if (source === undefined) return
  if (source === inputRead || source.startsWith(`${inputRead}.`)) {
    const path = pathOf(source.slice(inputRead.length))
    return path && { base: { input: true }, path }
  }
  if (source.startsWith(`${stepsRead}.`)) {
    const path = pathOf(source.slice(stepsRead.length))
    return path && path.length > 0 ? { base: { step: path[0]! }, path: path.slice(1) } : undefined
  }
  const variable = /^\$([A-Za-z_][A-Za-z0-9_]*)/.exec(source)
  if (!variable || variable[1] === 'states') return
  const path = pathOf(source.slice(variable[0].length))
  return path && { base: { variable: variable[1]! }, path }
}

const keyText = (key: string) => (plainKey.test(key) ? key : `\`${key}\``)

/** The JSONata read of a reference, such as `$fetch.body.ip`. */
export const readText = ({ base, path }: Reference) => ['input' in base ? inputRead : 'step' in base ? `${stepsRead}.${keyText(base.step)}` : `$${base.variable}`, ...path.map(keyText)].join('.')

/** A reference as the value of a field: `{% <read> %}`. */
export const referenceValue = (reference: Reference) => `{% ${readText(reference)} %}`
