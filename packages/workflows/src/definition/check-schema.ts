import { Ajv, type ErrorObject } from 'ajv'
import { definitionSchema } from './schema'
import { fieldPath, type Problem } from './problem'

const ajv = new Ajv({ allErrors: true, discriminator: true, strict: false })
const validate = ajv.compile(definitionSchema)

// `/States/Each/ItemProcessor/States/Fetch/Retry/0` as the state `Each/Fetch` and its field `Retry[0]`.
const located = (pointer: string): Pick<Problem, 'state' | 'field'> => {
  const parts = pointer.split('/').slice(1).map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'))
  const state: string[] = []
  let field: string[] = []
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index]!
    if (part === 'States' && index + 1 < parts.length) {
      state.push(parts[++index]!)
      field = []
    } else if (part === 'ItemProcessor' && parts[index + 1] === 'States') {
      continue
    } else if (part === 'Branches' && parts[index + 2] === 'States') {
      state.push(parts[++index]!)
    } else {
      field.push(part)
    }
  }
  return { ...(state.length > 0 && { state: state.join('/') }), ...(field.length > 0 && { field: fieldPath(field) }) }
}

const message = (error: ErrorObject) => {
  if (error.keyword === 'additionalProperties') return `${error.params.additionalProperty} is not a field here`
  if (error.keyword === 'required') return `${error.params.missingProperty} is missing`
  if (error.keyword === 'const') return `must be ${JSON.stringify(error.params.allowedValue)}`
  if (error.keyword === 'discriminator') return 'must be one of Pass, Task, Choice, Wait, Succeed, Fail, Map and Parallel'
  if (error.keyword === 'pattern') return 'must be an expression written as {% ... %}'
  if (error.keyword === 'oneOf' && error.schemaPath.endsWith('/oneOf')) return 'needs exactly one of these'
  return error.message ?? 'is not valid'
}

// The `oneOf` of Next or End, Seconds or Timestamp, says only "must match exactly one schema": name the fields instead.
const choices: Record<string, string> = { Next: 'needs either Next or End', Seconds: 'needs either Seconds or Timestamp' }

/** The ways a definition does not fit the schema, each with the state and field it is about. */
export const schemaProblems = (definition: unknown): Problem[] => {
  if (validate(definition)) return []
  const problems: Problem[] = []
  const seen = new Set<string>()
  const errors = validate.errors ?? []
  for (const error of errors) {
    // A "required" inside the oneOf of a state's Next or End only explains that oneOf's failure, reported in its place.
    if (error.keyword === 'required' && /(oneOf|allOf)\/\d+\/oneOf\/\d+\/required$/.test(error.schemaPath)) continue
    if (error.keyword === 'not') continue
    const where = { ...located(error.instancePath), ...(error.keyword === 'discriminator' && { field: 'Type' }) }
    let text = message(error)
    if (error.keyword === 'oneOf') {
      const branch = errors.find((other) => other.instancePath === error.instancePath && other.schemaPath.startsWith(error.schemaPath.replace(/\/oneOf$/, '/oneOf/')) && other.keyword === 'required')
      text = choices[String(branch?.params.missingProperty)] ?? text
    }
    const key = `${where.state}|${where.field}|${text}`
    if (seen.has(key)) continue
    seen.add(key)
    problems.push({ ...where, message: text })
  }
  return problems
}
