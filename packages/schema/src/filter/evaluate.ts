import { evaluateFilter as evaluate, type FunctionSpec } from 'aip-parsers/filter'
import type { CheckedFilter } from '../model'
import { lift } from './lift'
import { functions } from './profile'

export type EvaluateOptions = {
  /** Clock for `now()`; defaults to the current time. */
  now?: () => Date
}

const needsDatabase = (name: string) => (): never => {
  throw new Error(`Not implemented: ${name}() needs the database (the resource's search fields, trigram matching), so it cannot be evaluated against a record`)
}

// `in` and `isNull` are expanded before evaluation. `regex` uses JavaScript regular expressions,
// which differ from Postgres in corners such as lookbehind and POSIX classes.
const implementations = (now: () => Date): Record<string, FunctionSpec> => ({
  ...functions,
  search: { ...functions.search!, evaluate: needsDatabase('search') },
  similar: { ...functions.similar!, evaluate: needsDatabase('similar') },
  regex: {
    ...functions.regex!,
    evaluate: (values, pattern) => (values as unknown[]).some((value) => typeof value === 'string' && new RegExp(pattern as string).test(value)),
  },
  now: { ...functions.now!, evaluate: now },
})

/**
 * Evaluates a checked filter against a plain record keyed by field name, for rules such as
 * access filters on create. Throws `Not implemented` for `search` and `similar`.
 */
export const evaluateFilter = (checked: CheckedFilter, record: unknown, options: EvaluateOptions = {}) =>
  evaluate(lift(checked, { expand: true }), record, { functions: implementations(options.now ?? (() => new Date())) })
