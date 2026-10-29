import { describe, expect, it } from 'vitest'
import type { ProtobaseConfig } from '@protobase/config'
import { Page, page } from '@protobase/layout'
import { f, resource, userMenu, view } from '@protobase/schema'
import { configExports, defineFunction, defineTool } from '@protobase/server'
import { mergeConfig, type ConfigSource } from './merge-config'
import type { ProjectFiles } from './project-files'
import { projectFiles, projectFunctions, projectJobs, projectNotifications, projectOptions, projectResources, projectWebhooks } from './project-parts'

const things = resource('things').table('things').fields({ id: f.integer().readOnly() }).primaryKey((r) => r.id)
const tasks = resource('tasks').table('tasks').fields({ id: f.integer().readOnly() }).primaryKey((r) => r.id)

// A folder with these resources, functions and files, already loaded.
const folder = ({ resources, functions = {}, modules = {} }: { resources?: Record<string, unknown>; functions?: Record<string, unknown>; modules?: Record<string, unknown> }): ProjectFiles => ({
  ...(resources && { resources: async () => resources }),
  functions: Object.fromEntries(Object.entries(functions).map(([name, source]) => [name, async () => ({ default: source })])),
  module: (file) => (file in modules ? async () => ({ default: modules[file] }) : undefined),
  package: () => Promise.reject(new Error('no packages')),
})

const source = (label: string, config: ProtobaseConfig, files: ProjectFiles = folder({})): ConfigSource => ({ config: { name: label, ...config }, files, label })

const cloud = source('protobase-cloud', {}, folder({ resources: { tasks, tasksView: view('tasks'), usage: page('usage', Page({ title: 'Usage' })) } }))

const resourcesOf = async (...sources: ConfigSource[]) => configExports(await projectResources(mergeConfig(...sources)))

describe('mergeConfig', () => {
  it('keeps every resource, view and page of the folders, each once', async () => {
    const { resources, views, pages } = await resourcesOf(cloud, source('app', {}, folder({ resources: { things, again: tasks } })))
    expect(resources.map((entry) => entry.toModel().name)).toEqual(['tasks', 'things'])
    expect(views).toHaveLength(1)
    expect(pages.map((entry) => entry.name)).toEqual(['usage'])
  })

  it('refuses a resource or a page two configs define, naming both', async () => {
    const otherTasks = resource('tasks').table('jobs').fields({ id: f.integer().readOnly() }).primaryKey((r) => r.id)
    await expect(resourcesOf(cloud, source('app', {}, folder({ resources: { otherTasks } })))).rejects.toThrow('The resource "tasks" is defined twice, by protobase-cloud and by app; rename one of them')
    await expect(resourcesOf(cloud, source('app', {}, folder({ resources: { usage: page('usage', Page({ title: 'Mine' })) } })))).rejects.toThrow('The page "usage" is defined twice')
  })

  it('allows one user menu among all configs', async () => {
    const menu = userMenu((m) => [m.page('usage')])
    await expect(resourcesOf(source('a', {}, folder({ resources: { menu } })), source('b', {}, folder({ resources: { other: userMenu((m) => [m.page('usage')]) } })))).rejects.toThrow(
      'Only one config may export a user menu; a and b each do',
    )
  })

  it('adds the webhook pages first with `webhooks`', async () => {
    const { resources } = await resourcesOf(source('app', { webhooks: { deliveryLog: true } }, folder({ resources: { things } })))
    expect(resources.map((entry) => entry.toModel().name)).toEqual(['webhook_subscriptions', 'webhook_deliveries', 'webhook_delivery_log', 'things'])
  })

  it("keeps every folder's functions, and refuses a function name two folders use", async () => {
    const [usage, hello] = [defineFunction(() => new Response('usage')), defineFunction(() => new Response('hello'))]
    expect(await projectFunctions(mergeConfig(source('cloud', {}, folder({ functions: { usage } })), source('app', {}, folder({ functions: { hello } }))))).toEqual({ usage, hello })
    await expect(projectFunctions(mergeConfig(source('cloud', {}, folder({ functions: { usage } })), source('app', {}, folder({ functions: { usage: hello } }))))).rejects.toThrow('The function "usage" is defined twice, by cloud and by app')
  })

  it('declares the jobs of every config by name, each run from its own folder, and refuses a name two configs declare', () => {
    const run = async () => {}
    const jobs = projectJobs(mergeConfig(source('webhooks', { jobs: { prune: {} } }, folder({ modules: { 'jobs/prune.ts': run } })), source('app', { jobs: { 'send-invoice': { maxAttempts: 3 } } }, folder({ modules: { 'jobs/send-invoice.ts': run } }))))
    expect(jobs.map((job) => [job.name, job.options.maxAttempts])).toEqual([['prune', undefined], ['send-invoice', 3]])
    expect(() => mergeConfig(source('webhooks', { jobs: { prune: {} } }), source('app', { jobs: { prune: { maxAttempts: 1 } } }))).toThrow('The job "prune" is defined twice, by webhooks and by app')
  })

  it("runs the write hooks of every config in order, each from its own folder's hooks/", async () => {
    const ran: string[] = []
    const hook = (name: string) => async () => void ran.push(name)
    const options = await projectOptions(mergeConfig(source('cloud', { writeHooks: ['first'] }, folder({ modules: { 'hooks/first.ts': hook('first') } })), source('app', { writeHooks: ['second'] }, folder({ modules: { 'hooks/second.ts': hook('second') } }))))
    for (const writeHook of options!.writeHooks!) await writeHook({} as never, {} as never)
    expect(ran).toEqual(['first', 'second'])
  })

  it('takes every other value from the app, otherwise from the last config that sets it', () => {
    const merged = mergeConfig(source('first', { authenticate: { tenant: 1 }, statementTimeoutMs: 1000, mobile: { appId: 'net.protobase.cloud' } }), source('app', { statementTimeoutMs: 2000 }))
    expect(merged).toMatchObject({ name: 'app', authenticate: { tenant: 1 }, statementTimeoutMs: 2000, mobile: { appId: 'net.protobase.cloud' } })
  })

  it("gives the API its options from the config's top-level keys, by their names there", async () => {
    const options = await projectOptions(mergeConfig(source('app', { apiPath: '/api/v1', mcpEndpoint: false, runtimeUpdates: false, remoteResources: false, locale: 'nl', statementTimeoutMs: 500, url: 'https://x.example' })))
    expect(options).toEqual({ basePath: '/api/v1', mcp: false, runtime: false, sources: false, locale: 'nl', statementTimeoutMs: 500 })
  })

  it("offers every folder's mcp/tools.ts on the MCP endpoint, the extensions' first, and assistant/tools.ts only in the dock", async () => {
    const tool = (name: string) => defineTool({ name, description: name, parameters: { type: 'object' }, run: async () => name })
    const [usage, invoice, ask] = [tool('usage'), tool('invoice'), tool('ask')]
    const mcpOn = { auth: { mcp: true as const }, mcpEndpoint: { sql: true } }
    const extension = source('cloud', {}, folder({ modules: { 'mcp/tools.ts': [usage] } }))
    const app = (modules: Record<string, unknown>, config: ProtobaseConfig = mcpOn) => source('app', config, folder({ modules }))
    const options = await projectOptions(mergeConfig(extension, app({ 'mcp/tools.ts': [invoice], 'assistant/tools.ts': [ask] })))
    expect(options.mcp).toEqual({ sql: true, tools: [usage, invoice] })
    expect(options.assistant).toEqual({ tools: [ask] })
    expect((await projectOptions(mergeConfig(app({ 'assistant/tools.ts': [ask] })))).mcp).toEqual({ sql: true })
    // Without the endpoint, the file offers nothing.
    expect((await projectOptions(mergeConfig(app({ 'mcp/tools.ts': [invoice] }, {})))).mcp).toBeUndefined()
    expect((await projectOptions(mergeConfig(app({ 'mcp/tools.ts': [invoice] }, { auth: { mcp: true }, mcpEndpoint: false })))).mcp).toBe(false)
    await expect(projectOptions(mergeConfig(extension, app({ 'mcp/tools.ts': [tool('usage')] })))).rejects.toThrow('The MCP tool "usage" is defined twice, by cloud and by app; rename one of them')
  })

  it("finds the audit queue, the error hook, custom file providers, webhook owner roles and notification stores in the folders, the app's own last", async () => {
    const [audit, appAudit, onError, archive, ownerRoles, store, senders] = [{ publish: async () => {} }, { publish: async () => {} }, () => {}, { store: {} }, async () => [], Object.fromEntries(['register', 'remove', 'listForUser', 'listByIds', 'removeGone', 'removeAllForUser'].map((method) => [method, async () => {}])), []]
    const config = mergeConfig(
      source('cloud', {}, folder({ modules: { 'audit/queue.ts': audit, 'files/archive.ts': archive } })),
      source('app', { webhooks: {}, notifications: {}, files: { providers: { archive: { kind: 'custom' } } } }, folder({ modules: { 'audit/queue.ts': appAudit, 'hooks/error.ts': onError, 'webhooks/owner-roles.ts': ownerRoles, 'notifications/store.ts': store, 'notifications/senders.ts': senders } })),
    )
    expect(await projectOptions(config)).toEqual({ audit: appAudit, onUnhandledError: onError })
    expect((await projectFiles(config))?.providers).toEqual({ archive })
    expect(await projectWebhooks(config)).toEqual({ ownerRoles })
    expect(await projectNotifications(config)).toEqual({ store, senders })
    await expect(projectFiles(mergeConfig(source('app', { files: { providers: { vault: { kind: 'custom' } } } })))).rejects.toThrow('The file provider "vault" is custom but no config\'s folder has files/vault.ts')
  })

  it("finds sign-in's files in the folder of the last config that sets auth, else in the app's own", () => {
    const [cloudFiles, appFiles] = [folder({}), folder({})]
    expect(mergeConfig(source('cloud', {}, cloudFiles), source('app', {}, appFiles)).authFiles).toBe(appFiles)
    expect(mergeConfig(source('cloud', { auth: { organizations: true } }, cloudFiles), source('app', {}, appFiles)).authFiles).toBe(cloudFiles)
  })
})
