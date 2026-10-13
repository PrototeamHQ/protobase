import { evaluateFilter as evaluate, type FunctionSpec } from 'aip-parsers/filter'
import type { CheckedFilter, ResourceModel } from '../model'
import { matchesSearch } from '../search-match'
import { lift } from './lift'
import { functions } from './profile'

/** How `evaluateFilter` evaluates. */
export type EvaluateOptions = {
  /** Clock for `now()`; defaults to the current time. */
  now?: () => Date
  /**
   * The resource the record is of: `search("text")` then looks in its search fields as the API's search does, instead of
   * throwing `Not implemented`.
   */
  search?: ResourceModel
}

const needsDatabase = (name: string) => (): never => {
  throw new Error(`Not implemented: ${name}() needs the database (the resource's search fields, trigram matching), so it cannot be evaluated against a record`)
}

// `in` and `isNull` are expanded before evaluation. `regex` uses JavaScript regular expressions,
// which differ from Postgres in corners such as lookbehind and POSIX classes.
const implementations = (now: () => Date, record: unknown, model: ResourceModel | undefined): Record<string, FunctionSpec> => ({
  ...functions,
  search: { ...functions.search!, evaluate: model ? (text) => matchesSearch(model, record as Record<string, unknown>, text as string) : needsDatabase('search') },
  similar: { ...functions.similar!, evaluate: needsDatabase('similar') },
  regex: {
    ...functions.regex!,
    evaluate: (values, pattern) => (values as unknown[]).some((value) => typeof value === 'string' && new RegExp(pattern as string).test(value)),
  },
  now: { ...functions.now!, evaluate: now },
})

/**
 * Evaluates a checked filter against a plain record keyed by field name, for rules such as access filters on create, or
 * whether a new record fits a saved search. Throws `Not implemented` for `similar`, and for `search` without the
 * `search` option.
 */
export const evaluateFilter = (checked: CheckedFilter, record: unknown, options: EvaluateOptions = {}) =>
  evaluate(lift(checked, { expand: true }), record, { functions: implementations(options.now ?? (() => new Date()), record, options.search) })
