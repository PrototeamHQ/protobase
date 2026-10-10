import { isPageDefinition } from '@protobase/layout'
import type { Db } from '@protobase/query'
import type { AdminOptions } from './admin-options'
import type { AssistantOptions } from './assistant/assistant-settings'
import type { AdminAuth } from './better-auth/create-auth'
import type { Authenticator } from './types'

/** What `protobase.config.ts` may default-export. Everything is optional. */
export type ProjectConfig = {
  /** Names the config in errors, such as two configs defining the same tool; an extension should set it. */
  name?: string
  /** Configs this one extends: merged in order before it (see `mergeConfig`). */
  extends?: ProjectConfig[]
  /** The config module, e.g. `import * as config from './config'`; default: ./config/index.ts and ./config/*\/ui.ts. */
  config?: Record<string, unknown>
  db?: Db
  authenticate?: Authenticator
  /** A Better Auth instance; createAdmin mounts its routes under /api/auth. */
  auth?: AdminAuth
  options?: AdminOptions
}

/** Typed identity, for `export default defineConfig({ extends: [...], config, auth, ... })` in `protobase.config.ts`. */
export const defineConfig = (config: ProjectConfig) => config

type Named = { config: ProjectConfig; label: string }

// The objects' keys, each with the last value that is not undefined.
const lastSet = <T extends object>(objects: T[]): T =>
  Object.fromEntries(objects.flatMap((object) => Object.entries(object)).filter(([, value]) => value !== undefined)) as T

// Every config in merge order, each after the ones it extends, with the label errors name it by.
const flatten = (config: ProjectConfig, label: string): Named[] => [
  ...(config.extends ?? []).flatMap((parent, index) => flatten(parent, parent.name ?? `${label} extends[${index}]`)),
  { config, label },
]

// A name defined by two different values in two configs.
const checkUnique = (kind: string, entries: Array<{ name: string; value: unknown; label: string }>) => {
  const seen = new Map<string, { value: unknown; label: string }>()
  for (const { name, value, label } of entries) {
    const first = seen.get(name)
    if (first && first.value !== value) {
      throw new Error(`${kind} "${name}" is defined twice, ${first.label === label ? `in ${label}` : `by ${first.label} and by ${label}`}; rename one of them`)
    }
    if (!first) seen.set(name, { value, label })
  }
}

type Exportable = { toModel?: () => { name?: unknown }; recordSchema?: unknown; toUserMenuModel?: unknown }

// The config modules' exports as one module: every value once, under a key no other config uses.
const mergedModule = (named: Named[]) => {
  const withModule = named.filter(({ config }) => config.config)
  if (withModule.length === 0) return undefined
  const exports = withModule.flatMap(({ config, label }) => Object.entries(config.config!).map(([key, value]) => ({ key, value, label })))
  const values = exports.map((entry) => ({ ...entry, value: entry.value as Exportable }))
  checkUnique('The resource', values.filter(({ value }) => typeof value?.recordSchema === 'function' && typeof value.toModel === 'function').map(({ value, label }) => ({ name: String(value.toModel!().name), value, label })))
  checkUnique('The page', exports.filter(({ value }) => isPageDefinition(value)).map(({ value, label }) => ({ name: (value as { name: string }).name, value, label })))
  const menus = values.filter(({ value }) => typeof value?.toUserMenuModel === 'function')
  if (new Set(menus.map(({ value }) => value)).size > 1) throw new Error(`Only one config may export a user menu; ${menus.map(({ label }) => label).join(' and ')} each do`)

  const module: Record<string, unknown> = {}
  const own = withModule.at(-1)!.label
  for (const { key, value, label } of exports) {
    if (Object.values(module).includes(value)) continue
    module[label === own ? key : `${label}:${key}`] = value
  }
  return module
}

const mergedAssistant = (named: Named[]): AdminOptions['assistant'] => {
  const options = named.map(({ config, label }) => ({ assistant: config.options?.assistant, label })).filter(({ assistant }) => assistant !== undefined)
  if (options.length === 0) return undefined
  if (options.at(-1)!.assistant === false) return false
  // The settings of the configs after the last that turns the assistant off.
  const after = options.slice(options.findLastIndex(({ assistant }) => assistant === false) + 1) as Array<{ assistant: AssistantOptions; label: string }>
  const tools = after.flatMap(({ assistant, label }) => (assistant.tools ?? []).map((tool) => ({ tool, label })))
  checkUnique('The assistant tool', tools.map(({ tool, label }) => ({ name: tool.name, value: tool, label })))
  return { ...lastSet(after.map(({ assistant }) => assistant)), ...(tools.length > 0 && { tools: tools.map(({ tool }) => tool) }) }
}

const mergedOptions = (named: Named[]): AdminOptions | undefined => {
  const all = named.flatMap(({ config }) => (config.options ? [config.options] : []))
  if (all.length === 0) return undefined
  const writeHooks = all.flatMap((options) => options.writeHooks ?? [])
  const assistant = mergedAssistant(named)
  return {
    ...lastSet(all),
    ...(writeHooks.length > 0 && { writeHooks }),
    ...(assistant !== undefined && { assistant }),
  }
}

/**
 * One config from several, each after the ones it `extends`, the last being the app's own. Named things are all kept:
 * resources, views and pages of the config modules, assistant tools; one name defined by two configs is an error naming
 * both. Write hooks run in the same order. Every other value is the last config's that sets it, so the app's own wins.
 */
export const mergeConfig = (...configs: ProjectConfig[]): ProjectConfig => {
  const named = configs.flatMap((config, index) => flatten(config, config.name ?? `config ${index + 1}`))
  const { db, authenticate, auth } = lastSet(named.map(({ config }) => ({ db: config.db, authenticate: config.authenticate, auth: config.auth })))
  const module = mergedModule(named)
  const options = mergedOptions(named)
  const name = configs.at(-1)?.name
  return {
    ...(name && { name }),
    ...(module && { config: module }),
    ...(db && { db }),
    ...(authenticate && { authenticate }),
    ...(auth && { auth }),
    ...(options && { options }),
  }
}
