import type { ConnectionDeclaration, Plugin, StepType, TriggerType } from './types'
import type { JsonSchema } from './context'
import type { CacheChoice, StepCache } from './cache-types'

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
  /** A step type's cache advice: how much the workflow's author decides, the switch's default, and the warning before forcing it on. */
  cache?: { choice: CacheChoice; default?: boolean; disclaimer?: string }
  /** Whether a step type's call changes the outside world, so a replay does not call it: `by_input` when that depends on its input. */
  writes?: boolean | 'by_input'
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
  ...('cache' in type && type.cache && { cache: advice(type.cache) }),
  ...(!('kind' in type) && { writes: typeof type.writes === 'function' ? ('by_input' as const) : type.writes !== false }),
})

const advice = ({ choice, default: on, disclaimer }: StepCache) => ({ choice, ...(on !== undefined && { default: on }), ...(disclaimer !== undefined && { disclaimer }) })

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
