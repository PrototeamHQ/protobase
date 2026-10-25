import { describe, expect, it } from 'vitest'
import { f, resource, type ResourceModel } from '@protobase/schema'
import { Page, Settings, Tab, Tabs } from './blocks'
import { pageProblems } from './check-page'
import type { LayoutNode } from './node'
import type { PageModel } from './page'
import { prunePage } from './prune-page'
import { settingsFields, settingsResources, withSettingsFields } from './settings'

const preferences = resource('preferences')
  .table('preferences')
  .fields({
    user_id: f.text(),
    digest: f.enum(['daily', 'weekly', 'never']).default('weekly'),
    dark_mode: f.boolean().default(false),
    signature: f.text().optional(),
    api_token: f.text().optional().sensitive(),
    updated_at: f.timestamp().readOnly(),
  })
  .primaryKey((r) => r.user_id)
  .owner((r) => r.user_id)
  .toModel()
const notes = resource('notes').table('notes').fields({ id: f.integer().readOnly(), user_id: f.text(), body: f.text() }).primaryKey((r) => r.id).owner((r) => r.user_id).toModel()
const plans = resource('plans').table('plans').fields({ id: f.integer().readOnly(), name: f.text() }).primaryKey((r) => r.id).toModel()

const models: Record<string, ResourceModel> = { preferences, notes, plans }
const input = { models, actions: () => new Set<string>() }
const model = (tree: LayoutNode, name = 'test'): PageModel => ({ name, title: 'Test', tree })

describe('Settings', () => {
  it('shows every field a person can set by default: not the key and owner, read-only, sensitive or file fields', () => {
    expect(settingsFields(preferences)).toEqual(['digest', 'dark_mode', 'signature'])
  })

  it('accepts a resource whose owner is its key, with fields a person can set', () => {
    expect(pageProblems(model(Page({ title: 'x', children: [Settings({ resource: 'preferences' }), Settings({ resource: 'preferences', fields: ['digest', 'updated_at'] })] })), input)).toEqual([])
  })

  it('wants an owner that is the whole key, so each person has one record', () => {
    expect(pageProblems(model(Page({ title: 'x', children: [Settings({ resource: 'plans' }), Settings({ resource: 'notes' })] })), input)).toEqual([
      `<Page> › <Settings resource="plans">: plans has no .owner(...), so its records are not each person's own`,
      '<Page> › <Settings resource="notes">: the owner "user_id" must be the key of notes, so each person has one record: .primaryKey((r) => r.user_id)',
    ])
  })

  it('wants fields that are settings', () => {
    const tree = Page({ title: 'x', children: Settings({ resource: 'preferences', fields: ['user_id', 'nope', 'api_token'] }) })
    expect(pageProblems(model(tree), input)).toEqual([
      '<Page> › <Settings resource="preferences">: "user_id" is set by the server on preferences, so it is no setting',
      '<Page> › <Settings resource="preferences">: unknown field "nope" on preferences',
      '<Page> › <Settings resource="preferences">: "api_token" is sensitive, and Settings does not show sensitive fields',
    ])
  })

  it('names the resources the pages keep settings in', () => {
    const tabs = Page({ title: 'Account', children: Tabs({ children: Tab({ name: 'privacy', label: 'Privacy', children: Settings({ resource: 'preferences' }) }) }) })
    expect([...settingsResources([model(tabs, 'account'), model(Page({ title: 'x' }))])]).toEqual(['preferences'])
  })

  it('gives a Settings its default fields, then narrows them to what the caller reads', () => {
    const filled = withSettingsFields(model(Page({ title: 'x', children: Settings({ resource: 'preferences' }) })), models)
    expect((filled.tree.children[0] as LayoutNode).props.fields).toEqual(['digest', 'dark_mode', 'signature'])
    const { signature: _, ...readable } = preferences.fields
    const caller = { models: { preferences: { ...preferences, fields: readable } }, permissions: {}, actions: () => new Set<string>() }
    expect((prunePage(filled, [], caller)!.tree.children[0] as LayoutNode).props.fields).toEqual(['digest', 'dark_mode'])
    expect(prunePage(filled, [], { ...caller, models: {} })!.tree.children).toEqual([])
  })
})
