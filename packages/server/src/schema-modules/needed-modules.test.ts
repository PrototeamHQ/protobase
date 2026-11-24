import { describe, expect, it } from 'vitest'
import { f, resource, type ViewModel } from '@protobase/schema'
import { neededModules, type ModuleApp } from './needed-modules'

const tickets = resource('tickets').table('tickets').fields({ id: f.integer(), title: f.text() }).primaryKey((r) => r.id)
const app = (models: ModuleApp['models'], rest: Partial<ModuleApp> = {}): ModuleApp => ({ models, views: [], jobs: [], signIn: false, ...rest })

describe('neededModules', () => {
  it('needs the jobs schema for jobs of the app, comments, AI fields, live reads and time rollups, which jobs serve', () => {
    expect(neededModules(app([tickets.toModel()]))).toEqual([])
    expect(neededModules(app([tickets.toModel()], { jobs: [{}] }))).toEqual(['jobs'])
    expect(neededModules(app([tickets.comments().toModel()]))).toEqual(['jobs'])
    const summarised = resource('tickets').table('tickets').fields({ id: f.integer(), title: f.text(), summary: f.text().optional().ai({ prompt: 'Sum up {{title}}' }) }).primaryKey((r) => r.id)
    expect(neededModules(app([summarised.toModel()]))).toEqual(['jobs'])
    const thread = resource('thread').table('thread').fields({ id: f.text() }).primaryKey((r) => r.id).live({ reads: ['tickets'] })
    expect(neededModules(app([tickets.toModel(), thread.toModel()]))).toEqual(['jobs'])
    const readings = resource('readings').table('readings').fields({ id: f.bigint().readOnly(), taken_at: f.timestamp() }).primaryKey((r) => r.id)
    const hourly = resource('readings_hourly').table('readings_hourly').bucketsOf(readings, { time: (r) => r.taken_at, every: 'hour', by: () => [], late: '2 hours' })
    expect(neededModules(app([readings.toModel(), hourly.toModel()]))).toEqual(['jobs'])
  })

  it('needs the jobs schema for webhooks, workflows, notifications and mail feedback, whose events a job dispatches', () => {
    for (const rest of [{ webhooks: {} }, { workflows: {} }, { notifications: {} }, { mailFeedback: true }]) expect(neededModules(app([], rest))).toEqual(['jobs'])
  })

  it("needs the jobs schema for the relay's channels, with sign-in and a live conversation resource whose page has members", () => {
    const view = { resource: 'tickets', record: { conversation: { resource: 'messages', field: 'ticket_id', sender: 'author_id', time: 'created_at', text: 'body', members: 'members' } } } as unknown as ViewModel
    const live = tickets.fields({ id: f.integer(), title: f.text(), members: f.json() }).live().toModel()
    expect(neededModules(app([live], { views: [view], signIn: true }))).toEqual(['jobs'])
    expect(neededModules(app([live], { views: [view] }))).toEqual(['jobs'])
    expect(neededModules(app([tickets.fields({ id: f.integer(), members: f.json() }).toModel()], { views: [view], signIn: true }))).toEqual([])
  })
})
