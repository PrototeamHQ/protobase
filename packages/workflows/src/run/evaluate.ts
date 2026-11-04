import { compile, expressionSource, isJsonataError } from '../definition/expressions'
import { StepError } from './errors'

/** The values an expression reads by name: the variables in scope and `states`. */
export type Bindings = Record<string, unknown>

const evaluated = async (source: string, bindings: Bindings, field: string) => {
  try {
    return await compile(source).evaluate(undefined, bindings)
  } catch (error) {
    if (!isJsonataError(error)) throw error
    throw new StepError('States.QueryEvaluationError', `${field}: ${error.message}`)
  }
}

// The check lets an expression read a secret only as `$states.context.Secrets.<NAME>`, so this finds every one that does.
const secretRead = /\$states\s*\.\s*context\s*\.\s*Secrets\b/

/** Whether an expression reads one of the app's secrets. */
export const readsSecret = (source: string) => secretRead.test(source)

/** What a value computed from a secret is kept as, however the expression changed it, such as encoded or cut apart. */
export const secretValue = '[redacted]'

/**
 * A template with each `{% ... %}` replaced by its value; an evaluation that fails is `States.QueryEvaluationError`.
 * With `kept`, for a value the run keeps (an Output, a variable, a Map's items, a Fail's error), an expression that
 * reads a secret gives `[redacted]`: what it computes is never saved, and later states read what was saved.
 */
export const evaluateTemplate = async (template: unknown, bindings: Bindings, field: string, kept = false): Promise<unknown> => {
  const source = expressionSource(template)
  if (source !== undefined) return kept && readsSecret(source) ? secretValue : evaluated(source, bindings, field)
  if (Array.isArray(template)) return Promise.all(template.map((item, index) => evaluateTemplate(item, bindings, `${field}[${index}]`, kept)))
  if (typeof template === 'object' && template !== null) {
    const entries = await Promise.all(Object.entries(template).map(async ([key, value]) => [key, await evaluateTemplate(value, bindings, `${field}.${key}`, kept)] as const))
    return Object.fromEntries(entries.filter(([, value]) => value !== undefined))
  }
  return template
}

/** A value the run keeps: an Output, a Map's items or a Fail's error, an expression reading a secret kept as `[redacted]`. */
export const evaluateKept = (template: unknown, bindings: Bindings, field: string) => evaluateTemplate(template, bindings, field, true)

/** The values of an `Assign`, each by its name, an expression reading a secret kept as `[redacted]`. */
export const evaluateAssign = async (assign: Record<string, unknown> | undefined, bindings: Bindings, field = 'Assign') => {
  if (!assign) return {}
  return (await evaluateKept(assign, bindings, field)) as Record<string, unknown>
}

/**
 * A Task's arguments as its step records them: each one an expression computed from a secret is `[redacted]`, while
 * the step type is given the value itself.
 */
export const recordedArguments = (template: unknown, args: unknown): unknown => {
  const source = expressionSource(template)
  if (source !== undefined) return readsSecret(source) ? secretValue : args
  if (Array.isArray(template) && Array.isArray(args)) return args.map((item, index) => recordedArguments(template[index], item))
  if (typeof template === 'object' && template !== null && typeof args === 'object' && args !== null && !Array.isArray(args)) {
    return Object.fromEntries(Object.entries(args).map(([key, value]) => [key, recordedArguments((template as Record<string, unknown>)[key], value)]))
  }
  return args
}
