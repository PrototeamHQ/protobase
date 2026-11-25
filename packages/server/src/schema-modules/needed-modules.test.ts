import { describe, expect, it } from 'vitest'
import { f, resource, type ViewModel } from '@protobase/schema'
import { settingsStoreNames } from '../better-auth/store/offline/settings-names'
import { neededModules, type ModuleApp } from './needed-modules'
import { noInput } from './schema-module'

const tickets = resource('tickets').table('tickets').fields({ id: f.integer(), title: f.text() }).primaryKey((r) => r.id)
const ids = (app: ModuleApp) => Object.keys(neededModules(app))
const app = (models: ModuleApp['models'], rest: Partial<ModuleApp> = {}): ModuleApp => ({ models, views: [], jobs: [], signIn: false, ...rest })

describe('neededModules', () => {
  it('needs the jobs schema for jobs of the app, comments, AI fields, live reads and time rollups, which jobs serve', () => {
    expect(ids(app([tickets.toModel()]))).toEqual([])
    expect(ids(app([tickets.toModel()], { jobs: [{}] }))).toEqual(['jobs'])
    expect(ids(app([tickets.comments().toModel()]))).toEqual(['jobs'])
    const summarised = resource('tickets').table('tickets').fields({ id: f.integer(), title: f.text(), summary: f.text().optional().ai({ prompt: 'Sum up {{title}}' }) }).primaryKey((r) => r.id)
    expect(ids(app([summarised.toModel()]))).toEqual(['jobs'])
    const thread = resource('thread').table('thread').fields({ id: f.text() }).primaryKey((r) => r.id).live({ reads: ['tickets'] })
    expect(ids(app([tickets.toModel(), thread.toModel()]))).toEqual(['jobs', 'changes', 'notices'])
    const readings = resource('readings').table('readings').fields({ id: f.bigint().readOnly(), taken_at: f.timestamp() }).primaryKey((r) => r.id)
    const hourly = resource('readings_hourly').table('readings_hourly').bucketsOf(readings, { time: (r) => r.taken_at, every: 'hour', by: () => [], late: '2 hours' })
    expect(ids(app([readings.toModel(), hourly.toModel()]))).toEqual(['jobs'])
  })

  it('needs the jobs schema for webhooks, workflows, notifications and mail feedback, whose events a job dispatches, and their own tables', () => {
    expect(ids(app([], { webhooks: {} }))).toEqual(['jobs', 'webhooks'])
    expect(ids(app([], { workflows: {} }))).toEqual(['jobs', 'workflows'])
    expect(ids(app([], { notifications: {} }))).toEqual(['jobs', 'notification_devices', 'notification_history'])
    expect(ids(app([], { mailFeedback: true }))).toEqual(['jobs', 'changes'])
  })

  it("needs an option's own tables as a module of their own while the option is on, under the schema the config names", () => {
    const webhooks = neededModules(app([], { webhooks: { schema: 'hooks', deliveryLog: true }, events: { schema: 'events' } }))
    expect(webhooks.webhooks).toEqual({ names: { schema: 'hooks', changes: 'events' }, resources: {} })
    expect(webhooks.webhook_delivery_log).toEqual({ names: { schema: 'hooks' }, resources: {} })
    const workflows = neededModules(app([], { workflows: { schema: 'flows', storage: {}, customSteps: true } }))
    expect(Object.keys(workflows)).toEqual(['jobs', 'workflows', 'workflow_storage', 'workflow_custom_steps'])
    expect(workflows.workflow_custom_steps).toEqual({ names: { schema: 'flows' }, resources: {} })
  })

  it("names the notifications tables, their columns and the auth store's users they point at, and leaves out a table a store of the app's own replaces", () => {
    const store = settingsStoreNames({ tables: { user: { name: 'people' } }, generateUserId: 'uuid' })
    const targets = neededModules(app([], { notifications: { schema: 'push', devices: { columns: { token: 'address' } } }, signIn: true, authStore: store }))
    expect(targets.notification_devices!.names).toMatchObject({ schema: 'push', table: 'devices', users: '"auth"."people"', user_id_type: 'uuid', 'column.token': 'address', 'column.kind': 'kind' })
    expect(targets.notification_history!.names).toMatchObject({ schema: 'push', table: 'history', users: '"auth"."people"', user_id_type: 'uuid' })
    expect(neededModules(app([], { notifications: {} })).notification_devices!.names).toMatchObject({ users: '', user_id_type: 'text' })
    expect(ids(app([], { notifications: { store: {} as never } }))).toEqual(['jobs', 'notification_history'])
  })

  it("needs the jobs schema for the relay's channels, with sign-in and a live conversation resource whose page has members", () => {
    const view = { resource: 'tickets', record: { conversation: { resource: 'messages', field: 'ticket_id', sender: 'author_id', time: 'created_at', text: 'body', members: 'members' } } } as unknown as ViewModel
    const live = tickets.fields({ id: f.integer(), title: f.text(), members: f.json() }).live().toModel()
    expect(ids(app([live], { views: [view], signIn: true }))).toEqual(['jobs', 'changes', 'notices'])
    expect(ids(app([live], { views: [view] }))).toEqual(['jobs', 'changes', 'notices'])
    expect(ids(app([tickets.fields({ id: f.integer(), members: f.json() }).toModel()], { views: [view], signIn: true }))).toEqual([])
  })

  it("needs the jobs schema for the relay's channels the config declares, with nothing else that needs jobs", () => {
    expect(ids(app([tickets.toModel()]))).toEqual([])
    expect(ids(app([tickets.toModel()], { realtime: { relay: { channels: { tickets: {} } } } }))).toEqual(['jobs'])
  })

  it('needs the change capture for captured resources, with their triggers by resource, and the history and notices tables for history and live updates, in the schema events names', () => {
    expect(neededModules(app([tickets.toModel()]))).toEqual({})
    const withEvents = tickets.events((e) => e.crud())
    const targets = neededModules(app([withEvents.toModel()], { events: { schema: 'events' } }))
    expect(Object.keys(targets)).toEqual(['jobs', 'changes'])
    expect(targets.jobs).toEqual(noInput)
    expect(targets.changes!.names).toEqual({ schema: 'events' })
    expect(targets.changes!.resources.triggers!.tickets).toMatchObject({ table: { name: 'tickets' } })
    expect(Object.keys(neededModules(app([withEvents.history().toModel()])))).toEqual(['jobs', 'changes', 'history'])
    expect(Object.keys(neededModules(app([tickets.live().toModel()])))).toEqual(['jobs', 'changes', 'notices'])
    expect(neededModules(app([tickets.live().toModel()])).notices).toEqual({ names: { schema: 'changes' }, resources: {} })
  })

  it("keeps the triggers of a resource no longer captured only to follow it, and gives a captured resource's table to it alone", () => {
    const orders = resource('orders').table('tickets').fields({ id: f.integer() }).primaryKey((r) => r.id)
    const triggers = neededModules(app([tickets.events((e) => e.crud()).toModel(), orders.toModel(), resource('notes').table('notes').fields({ id: f.integer() }).primaryKey((r) => r.id).toModel()])).changes!.resources.triggers!
    expect(Object.keys(triggers)).toEqual(['tickets', 'notes'])
    expect(triggers.tickets!.kept).toBeUndefined()
    expect(triggers.notes!.kept).toBe(true)
    expect(() => neededModules(app([tickets.events((e) => e.crud()).toModel(), orders.events((e) => e.crud()).toModel()]))).toThrow('Not implemented: resources "tickets" and "orders" both have events or history on table "public"."tickets"')
    const qualified = resource('qualified').table('public.tickets').fields({ id: f.integer() }).primaryKey((r) => r.id).events((e) => e.crud())
    expect(() => neededModules(app([tickets.events((e) => e.crud()).toModel(), qualified.toModel()]))).toThrow('Not implemented: resources "tickets" and "qualified" both have events or history on table "public"."tickets"')
  })
})
