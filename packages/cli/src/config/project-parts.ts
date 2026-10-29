import { isPageDefinition } from '@protobase/layout'
import type { AdminOptions, AssistantTool, AuditQueue, DeviceStore, FileProvider, FilesOptions, FunctionSource, HistoryStore, JobDefinition, JobRun, NotificationsOptions, PipelineHook, PushSender, Sharp, WebhooksOptions } from '@protobase/server'
import { checkNotificationsOptions, declaredJob, fileProviderOf, isSubscription, webhooksModule } from '@protobase/server/internal'
import { checkUnique, type MergedConfig } from './merge-config'

// What a merged config describes, with the project's code its conventions find, loaded when a command needs it: each
// part loads only its own files.

type Exportable = { toModel?: () => { name?: unknown }; recordSchema?: unknown; toUserMenuModel?: unknown }

type LabeledModule = { module: Record<string, unknown>; label: string }

/** The config modules' exports as one module: every value once, under a key no other config uses. */
export const mergedModule = (modules: LabeledModule[]) => {
  const exports = modules.flatMap(({ module, label }) => Object.entries(module).map(([key, value]) => ({ key, value, label })))
  const values = exports.map((entry) => ({ ...entry, value: entry.value as Exportable }))
  checkUnique('The resource', values.filter(({ value }) => typeof value?.recordSchema === 'function' && typeof value.toModel === 'function').map(({ value, label }) => ({ name: String(value.toModel!().name), value, label })))
  checkUnique('The page', exports.filter(({ value }) => isPageDefinition(value)).map(({ value, label }) => ({ name: (value as { name: string }).name, value, label })))
  checkUnique('The subscription', exports.filter(({ value }) => isSubscription(value)).map(({ value, label }) => ({ name: (value as { name: string }).name, value, label })))
  const menus = values.filter(({ value }) => typeof value?.toUserMenuModel === 'function')
  if (new Set(menus.map(({ value }) => value)).size > 1) throw new Error(`Only one config may export a user menu; ${menus.map(({ label }) => label).join(' and ')} each do`)

  const merged: Record<string, unknown> = {}
  const own = modules.at(-1)?.label
  for (const { key, value, label } of exports) {
    if (Object.values(merged).includes(value)) continue
    merged[label === own ? key : `${label}:${key}`] = value
  }
  return merged
}

/** The resources, views, pages and subscriptions of every config's config/ folder, after the webhook pages of `webhooks`. */
export const projectResources = async (config: MergedConfig) => {
  const modules = await Promise.all(config.sources.flatMap(({ files, label }) => (files.resources ? [files.resources().then((module) => ({ module, label }))] : [])))
  const webhooks = config.webhooks ? [{ module: webhooksModule(config.webhooks), label: 'protobase-webhooks' }] : []
  return mergedModule([...webhooks, ...modules])
}

/** The declared jobs, each run by the default export of its jobs/<name>.ts, loaded on its first run; schedules in the app's `timezone` unless a job names its own. */
export const projectJobs = (config: MergedConfig): JobDefinition[] =>
  Object.entries(config.jobs).map(([name, { declaration, files, label }]) => {
    const load = files.module(`jobs/${name}.ts`)
    if (!load) throw new Error(`The job "${name}" of ${label} has no jobs/${name}.ts: write what it does there, as its default export`)
    const timezone = declaration.timezone ?? config.timezone
    return declaredJob(name, { ...declaration, ...(timezone && { timezone }) }, async () => (await load()).default as JobRun)
  })

/** The API functions of every config's functions/ folder by name, each its file's default export. */
export const projectFunctions = async (config: MergedConfig): Promise<Record<string, FunctionSource> | undefined> => {
  const all = config.sources.flatMap(({ files, label }) => Object.entries(files.functions).map(([name, load]) => ({ name, value: load, label })))
  if (all.length === 0) return undefined
  checkUnique('The function', all)
  return Object.fromEntries(await Promise.all(all.map(async ({ name, value }) => [name, (await value()).default as FunctionSource] as const)))
}

/** The write hooks by name, each the default export of hooks/<name>.ts, loaded on its first write. */
export const projectWriteHooks = (config: MergedConfig): PipelineHook[] =>
  config.writeHooks.map(({ name, files, label }) => {
    const load = files.module(`hooks/${name}.ts`)
    if (!load) throw new Error(`The write hook "${name}" of ${label} has no hooks/${name}.ts: write it there, as its default export`)
    let hook: Promise<PipelineHook> | undefined
    return async (event, trx) => (await (hook ??= load().then((module) => module.default as PipelineHook)))(event, trx)
  })

/** The module at `file` of the last config's folder that has one, such as auth/mailer.ts; `undefined` when none has it. */
export const lastModule = async (config: MergedConfig, file: string) => {
  const load = config.sources.map(({ files }) => files.module(file)).findLast(Boolean)
  return load && (await load())
}

/** The default export of the last config folder's `file`; `undefined` when none has it. */
const lastDefault = async <T>(config: MergedConfig, file: string) => (await lastModule(config, file))?.default as T | undefined

/** The roles: the `roles` of the last config/roles.ts among the configs' folders. */
export const projectRoles = async (config: MergedConfig): Promise<AdminOptions['roles']> => {
  const module = await lastModule(config, 'config/roles.ts')
  return module && ((module.roles ?? module.default) as AdminOptions['roles'])
}

/** The default export of every config folder's `file`, a list of tools, the extensions' first, each name once. */
const projectTools = async (config: MergedConfig, file: string, kind: string): Promise<AssistantTool[]> => {
  const found = config.sources.flatMap(({ files, label }) => {
    const load = files.module(file)
    return load ? [load().then((module) => (module.default as AssistantTool[]).map((tool) => ({ tool, label })))] : []
  })
  const tools = (await Promise.all(found)).flat()
  checkUnique(kind, tools.map(({ tool, label }) => ({ name: tool.name, value: tool, label })))
  return tools.map(({ tool }) => tool)
}

/** The dock assistant's own tools, of every config folder's assistant/tools.ts; none while the assistant is off. */
export const projectAssistantTools = async (config: MergedConfig) => (config.assistant === false ? [] : projectTools(config, 'assistant/tools.ts', 'The assistant tool'))

/** The MCP endpoint's own tools, of every config folder's mcp/tools.ts; none without `auth.mcp` or with `mcpEndpoint: false`. */
export const projectMcpTools = async (config: MergedConfig) => (!config.auth || !config.auth.mcp || config.mcpEndpoint === false ? [] : projectTools(config, 'mcp/tools.ts', 'The MCP tool'))

/**
 * The API's options, from the config's top-level keys, with what the conventions find: the roles, write hooks,
 * assistant and MCP tools, the audit queue of audit/queue.ts and the error hook of hooks/error.ts.
 */
export const projectOptions = async (config: MergedConfig): Promise<AdminOptions> => {
  const { apiPath, mcpEndpoint, runtimeUpdates, remoteResources, locale, apiKeys, statementTimeoutMs, scanGuard, defaultAccess, rowPermissions, errorReporting, assistant, cors, maps, plugins } = config
  const settings = { apiKeys, statementTimeoutMs, scanGuard, defaultAccess, rowPermissions, errorReporting, assistant, cors, maps, plugins, locale, basePath: apiPath, mcp: mcpEndpoint, runtime: runtimeUpdates, sources: remoteResources }
  const [roles, tools, mcpTools, audit, onUnhandledError] = await Promise.all([
    projectRoles(config),
    projectAssistantTools(config),
    projectMcpTools(config),
    lastDefault<AuditQueue>(config, 'audit/queue.ts'),
    lastDefault<AdminOptions['onUnhandledError']>(config, 'hooks/error.ts'),
  ])
  const writeHooks = projectWriteHooks(config)
  const options = Object.fromEntries(Object.entries(settings).filter(([, value]) => value !== undefined)) as AdminOptions
  return {
    ...options,
    ...(roles && { roles }),
    ...(writeHooks.length > 0 && { writeHooks }),
    ...(tools.length > 0 && { assistant: { ...(options.assistant || {}), tools } }),
    ...(mcpTools.length > 0 && { mcp: { ...(options.mcp || {}), tools: mcpTools } }),
    ...(audit && { audit }),
    ...(onUnhandledError && { onUnhandledError }),
  }
}

// A provider of `kind: 'custom'` is the default export of files/<name>.ts in a config's folder.
const customProvider = async (config: MergedConfig, name: string) => {
  const provider = await lastDefault<FileProvider>(config, `files/${name}.ts`)
  if (!provider) throw new Error(`The file provider "${name}" is custom but no config's folder has files/${name}.ts: export the provider there, as its default export`)
  return provider
}

/** Where file fields keep their bytes: the providers made from their settings or found in files/<name>.ts, and the image library by its name. */
export const projectFiles = async (config: MergedConfig): Promise<FilesOptions | undefined> => {
  if (!config.files) return undefined
  const { providers, images, ...files } = config.files
  const made = providers && Object.fromEntries(await Promise.all(Object.entries(providers).map(async ([name, settings]) => [name, settings.kind === 'custom' ? await customProvider(config, name) : fileProviderOf(name, settings)] as const)))
  return { ...files, ...(made && { providers: made }), ...(images && { sharp: (await config.sources.at(-1)!.files.package(images)).default as Sharp }) }
}

/** The webhooks options, with the owner roles of webhooks/owner-roles.ts when a config's folder has it. */
export const projectWebhooks = async (config: MergedConfig): Promise<WebhooksOptions | undefined> => {
  if (!config.webhooks) return undefined
  const ownerRoles = await lastDefault<WebhooksOptions['ownerRoles']>(config, 'webhooks/owner-roles.ts')
  return { ...config.webhooks, ...(ownerRoles && { ownerRoles }) }
}

/**
 * The notifications options, checked, with what the conventions find in notifications/: the device store of store.ts,
 * the history store of history-store.ts and the push senders of senders.ts, each its default export.
 */
export const projectNotifications = async (config: MergedConfig): Promise<NotificationsOptions | undefined> => {
  if (!config.notifications) return undefined
  const [store, historyStore, senders] = await Promise.all([
    lastDefault<DeviceStore>(config, 'notifications/store.ts'),
    lastDefault<HistoryStore>(config, 'notifications/history-store.ts'),
    lastDefault<PushSender[]>(config, 'notifications/senders.ts'),
  ])
  return checkNotificationsOptions({ ...config.notifications, ...(store && { store }), ...(historyStore && { historyStore }), ...(senders && { senders }) })
}
