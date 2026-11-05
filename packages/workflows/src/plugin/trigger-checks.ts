import { Ajv } from 'ajv'
import type { TriggerCheck } from '../definition/check-trigger'
import type { Plugin } from './types'

const ajv = new Ajv({ allErrors: true, strict: false })

/** Each trigger type of `plugins` by id, with the check of its input a save runs: its schema, then its own check. */
export const triggerChecks = (plugins: readonly Plugin[]): Record<string, TriggerCheck> =>
  Object.fromEntries(
    plugins.flatMap((plugin) =>
      Object.entries(plugin.triggers ?? {}).map(([key, type]) => {
        const validate = ajv.compile(type.input)
        const check: TriggerCheck = (input) => {
          if (!validate(input)) return (validate.errors ?? []).map((error) => ({ ...(error.instancePath && { field: error.instancePath.slice(1).replaceAll('/', '.') }), message: error.message ?? 'is not valid' }))
          return type.check?.(input) ?? []
        }
        return [`${plugin.name}:${key}`, check]
      }),
    ),
  )
