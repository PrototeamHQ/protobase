import { Ajv, type ErrorObject } from 'ajv'
import type { TriggerCheck } from '../definition/check-trigger'
import type { Plugin } from './types'

const ajv = new Ajv({ allErrors: true, strict: false })

// A schema error at the field it is about: a missing property at its own path, not at the object that lacks it.
const problem = (error: ErrorObject) => {
  const path = error.instancePath.slice(1).split('/').filter(Boolean)
  if (error.keyword === 'required') return { field: [...path, String(error.params.missingProperty)].join('.'), message: 'is missing' }
  return { ...(path.length > 0 && { field: path.join('.') }), message: error.message ?? 'is not valid' }
}

/** Each trigger type of `plugins` by id, with the check of its input a save runs: its schema, then its own check. */
export const triggerChecks = (plugins: readonly Plugin[]): Record<string, TriggerCheck> =>
  Object.fromEntries(
    plugins.flatMap((plugin) =>
      Object.entries(plugin.triggers ?? {}).map(([key, type]) => {
        const validate = ajv.compile(type.input)
        const check: TriggerCheck = (input) => {
          if (!validate(input)) return (validate.errors ?? []).map(problem)
          return type.check?.(input) ?? []
        }
        return [`${plugin.name}:${key}`, check]
      }),
    ),
  )
