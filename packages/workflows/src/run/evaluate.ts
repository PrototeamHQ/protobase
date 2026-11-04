import { compile, expressionSource, isJsonataError } from '../definition/expressions'
import { StepError } from './errors'

/** The values an expression reads by name: `trigger`, the variables in scope and `states`. */
export type Bindings = Record<string, unknown>

const evaluated = async (source: string, bindings: Bindings, field: string) => {
  try {
    return await compile(source).evaluate(undefined, bindings)
  } catch (error) {
    if (!isJsonataError(error)) throw error
    throw new StepError('States.QueryEvaluationError', `${field}: ${error.message}`)
  }
}

/** A template with each `{% ... %}` replaced by its value; an evaluation that fails is `States.QueryEvaluationError`. */
export const evaluateTemplate = async (template: unknown, bindings: Bindings, field: string): Promise<unknown> => {
  const source = expressionSource(template)
  if (source !== undefined) return evaluated(source, bindings, field)
  if (Array.isArray(template)) return Promise.all(template.map((item, index) => evaluateTemplate(item, bindings, `${field}[${index}]`)))
  if (typeof template === 'object' && template !== null) {
    const entries = await Promise.all(Object.entries(template).map(async ([key, value]) => [key, await evaluateTemplate(value, bindings, `${field}.${key}`)] as const))
    return Object.fromEntries(entries.filter(([, value]) => value !== undefined))
  }
  return template
}

/** The values of an `Assign`, each by its name. */
export const evaluateAssign = async (assign: Record<string, unknown> | undefined, bindings: Bindings, field = 'Assign') => {
  if (!assign) return {}
  return (await evaluateTemplate(assign, bindings, field)) as Record<string, unknown>
}
