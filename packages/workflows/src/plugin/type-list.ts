import type { ConnectionDeclaration, Plugin, StepType, TriggerType } from './types'
import type { JsonSchema } from './context'

/** A type as the MCP tools and the editor list it: built-in and plugin types alike. */
export type TypeEntry = {
  /** `<plugin>:<key>`: a Task's `Resource`, or the key of a definition's `trigger`. */
  id: string
  kind: 'step' | TriggerType['kind']
  plugin: string
  label: string
  description: string
  input: JsonSchema
  output?: JsonSchema
  errors?: Record<string, string>
  connection?: { name: string } & ConnectionDeclaration
  /** False when this app cannot run it, with the reason; a definition that uses it is not saved. */
  available: boolean
  reason?: string
}

const entry = (plugin: Plugin, key: string, type: StepType | TriggerType): Omit<TypeEntry, 'available'> => ({
  id: `${plugin.name}:${key}`,
  kind: 'kind' in type ? type.kind : 'step',
  plugin: plugin.name,
  label: type.label,
  description: type.description,
  input: type.input,
  ...(type.output && { output: type.output }),
  ...('errors' in type && type.errors && { errors: Object.fromEntries(Object.entries(type.errors).map(([name, text]) => [`${type.errorPrefix ?? 'Step'}.${name}`, text])) }),
  ...(type.connection !== undefined && { connection: { name: type.connection, ...plugin.connections![type.connection]! } }),
})

/** Why the app cannot run a type, or undefined when it can. */
export type Unavailable = (type: Omit<TypeEntry, 'available'>) => string | undefined

/** Every type of `plugins`, steps first, each marked available or not by `unavailable`. */
export const typeList = (plugins: readonly Plugin[], unavailable: Unavailable): TypeEntry[] =>
  plugins
    .flatMap((plugin) => [...Object.entries(plugin.steps ?? {}), ...Object.entries(plugin.triggers ?? {})].map(([key, type]) => entry(plugin, key, type)))
    .map((type) => {
      const reason = unavailable(type)
      return { ...type, available: reason === undefined, ...(reason !== undefined && { reason }) }
    })
