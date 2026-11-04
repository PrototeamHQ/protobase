import jsonata, { type Expression } from 'jsonata'
import { limits } from '../limits'

const pattern = /^\{%([\s\S]*)%\}$/

/** The JSONata source of a `{% ... %}` string, or `undefined` for any other value. */
export const expressionSource = (value: unknown) => (typeof value === 'string' ? pattern.exec(value)?.[1] : undefined)

/** Each expression in a template, with its path below the template's own field. */
export const templateExpressions = (value: unknown, path: (string | number)[] = []): { path: (string | number)[]; source: string }[] => {
  const source = expressionSource(value)
  if (source !== undefined) return [{ path, source }]
  if (Array.isArray(value)) return value.flatMap((item, index) => templateExpressions(item, [...path, index]))
  if (typeof value === 'object' && value !== null) return Object.entries(value).flatMap(([key, item]) => templateExpressions(item, [...path, key]))
  return []
}

/** A JSONata error, thrown by its parser or evaluator as a plain object with a code such as `S0201`. */
export type JsonataError = { code: string; position?: number; message: string }

export const isJsonataError = (error: unknown): error is JsonataError =>
  typeof error === 'object' && error !== null && typeof (error as { code?: unknown }).code === 'string' && typeof (error as { message?: unknown }).message === 'string'

/** A compiled expression, with the guards every evaluation runs under: a time limit, a depth limit and a sequence size. */
export const compile = (source: string): Expression => jsonata(source, { timeout: limits.expressionMs, stack: limits.expressionDepth, sequence: limits.mapItems * 10 })

/** The expression compiled, or the parser's error. */
export const parse = (source: string): { expression: Expression } | { error: JsonataError } => {
  try {
    return { expression: compile(source) }
  } catch (error) {
    if (!isJsonataError(error)) throw error
    return { error }
  }
}
