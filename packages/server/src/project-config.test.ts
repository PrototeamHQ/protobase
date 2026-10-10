import { describe, expect, it } from 'vitest'
import { Page, page } from '@protobase/layout'
import { f, resource, userMenu, view } from '@protobase/schema'
import { configExports } from './resource-source'
import { defineConfig, mergeConfig } from './project-config'
import { defineTool } from './assistant/tools'
import type { Authenticator, PipelineHook } from './types'

const things = resource('things').table('things').fields({ id: f.integer().readOnly() }).primaryKey((r) => r.id)
const tasks = resource('tasks').table('tasks').fields({ id: f.integer().readOnly() }).primaryKey((r) => r.id)
const tool = (name: string) => defineTool({ name, description: name, parameters: { type: 'object' }, run: async () => name })
const authenticator = (name: string) => Object.assign((async () => ({ user: { id: name, roles: [] } })) as unknown as Authenticator, { label: name })

const cloud = defineConfig({
  name: 'protobase-cloud',
  config: { tasks, tasksView: view('tasks'), usage: page('usage', Page({ title: 'Usage' })) },
  options: { assistant: { tools: [tool('protobase_cloud_get_task')] } },
})

describe('mergeConfig', () => {
  it('keeps every resource, view and page of the config modules, each once', () => {
    const app = defineConfig({ name: 'app', extends: [cloud], config: { things, again: tasks } })
    const { resources, views, pages } = configExports(mergeConfig(app).config!)
    expect(resources.map((source) => source.toModel().name)).toEqual(['tasks', 'things'])
    expect(views).toHaveLength(1)
    expect(pages.map((entry) => entry.name)).toEqual(['usage'])
  })

  it('refuses a resource or a page two configs define, naming both', () => {
    const otherTasks = resource('tasks').table('jobs').fields({ id: f.integer().readOnly() }).primaryKey((r) => r.id)
    expect(() => mergeConfig(cloud, { name: 'app', config: { otherTasks } })).toThrow('The resource "tasks" is defined twice, by protobase-cloud and by app; rename one of them')
    expect(() => mergeConfig(cloud, { name: 'app', config: { usage: page('usage', Page({ title: 'Mine' })) } })).toThrow('The page "usage" is defined twice, by protobase-cloud and by app')
    expect(() => mergeConfig({ name: 'app', config: { tasks, otherTasks } })).toThrow('The resource "tasks" is defined twice, in app; rename one of them')
  })

  it('allows one user menu among all configs', () => {
    const menu = userMenu((m) => [m.page('usage')])
    expect(configExports(mergeConfig({ name: 'a', config: { menu } }, { name: 'b', config: { things } }).config!).userMenu).toBe(menu)
    expect(() => mergeConfig({ name: 'a', config: { menu } }, { name: 'b', config: { other: userMenu((m) => [m.page('usage')]) } })).toThrow('Only one config may export a user menu; a and b each do')
  })

  it('lists the assistant tools of the extended configs first, and refuses a tool name two configs use, naming both', () => {
    const merged = mergeConfig(defineConfig({ name: 'app', extends: [cloud], options: { assistant: { tools: [tool('propose_task')] } } }))
    expect(merged.options?.assistant && merged.options.assistant.tools?.map((entry) => entry.name)).toEqual(['protobase_cloud_get_task', 'propose_task'])
    expect(() => mergeConfig(defineConfig({ name: 'app', extends: [cloud], options: { assistant: { tools: [tool('protobase_cloud_get_task')] } } }))).toThrow(
      'The assistant tool "protobase_cloud_get_task" is defined twice, by protobase-cloud and by app; rename one of them',
    )
  })

  it('runs the write hooks of every config, the extended ones first', () => {
    const hook = (name: string) => Object.assign((async () => undefined) as PipelineHook, { label: name })
    const [first, second, third] = [hook('first'), hook('second'), hook('third')]
    expect(mergeConfig({ options: { writeHooks: [first, second] } }, { options: { writeHooks: [third] } }).options?.writeHooks).toEqual([first, second, third])
  })

  it('takes every other value from the app, otherwise from the last config that sets it', () => {
    const [own, extended, earlier] = [authenticator('own'), authenticator('extended'), authenticator('earlier')]
    const first = defineConfig({ name: 'first', authenticate: earlier, options: { statementTimeoutMs: 1000, roles: { admin: ['*'] } as never, assistant: { url: 'https://first.example.com' } } })
    const second = defineConfig({ name: 'second', authenticate: extended, options: { statementTimeoutMs: 2000, assistant: { url: 'https://second.example.com', model: 'm' } } })
    expect(mergeConfig(first, second, { name: 'app', options: { statementTimeoutMs: undefined } })).toEqual({
      name: 'app',
      authenticate: extended,
      options: { statementTimeoutMs: 2000, roles: { admin: ['*'] }, assistant: { url: 'https://second.example.com', model: 'm' } },
    })
    expect(mergeConfig(first, { authenticate: own, options: { statementTimeoutMs: 3000, assistant: false } })).toMatchObject({ authenticate: own, options: { statementTimeoutMs: 3000, assistant: false } })
  })

  it('merges the configs a config extends before it, depth first, and names unnamed ones by their place', () => {
    const base = { config: { things } }
    const middle = { extends: [base], config: { other: resource('things').table('stuff').fields({ id: f.integer().readOnly() }).primaryKey((r) => r.id) } }
    expect(() => mergeConfig({ name: 'app', extends: [middle] })).toThrow('The resource "things" is defined twice, by app extends[0] extends[0] and by app extends[0]')
    expect(mergeConfig({ extends: [base] })).not.toHaveProperty('extends')
  })
})
