import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import type { ResourceChange } from '../changes/resource-change'
import type { Deps } from '../deps'
import { buildRegistry } from '../registry'
import { eventChange, subscriberEvents, subscriptionEvent } from './subscriber-view'
import { subscription } from './subscription'

// A presence rule, as the docs teach for encrypted fields: only holders of `keys` see records whose secret is set.
const keys = resource('keys')
  .table('keys')
  .fields({ id: f.integer(), name: f.text(), secret: f.text().optional().encrypted() })
  .primaryKey((r) => r.id)
  .access({ read: (ctx, record) => record!.secret == null || (ctx.user?.roles ?? []).includes('keys') })
const roles = (ctx: { user?: { roles?: readonly string[] } | null }) => ctx.user?.roles ?? []
// A plain sensitive field, also left out of every captured record, under rules that read it and one that checks the role first.
const secrets = (name: string, read: (ctx: { user?: { roles?: readonly string[] } | null }, record?: Record<string, unknown>) => unknown) =>
  resource(name)
    .table(name)
    .fields({ id: f.integer(), name: f.text(), api_secret: f.text().optional().sensitive() })
    .primaryKey((r) => r.id)
    .access({ read: read as never })
const rowFilters = ['-api_secret:*', 'NOT api_secret:*', 'NOT api_secret = "x"', 'api_secret != "x"', 'api_secret = null']
const presence = secrets('presence', (ctx, record) => record!.api_secret == null || roles(ctx).includes('admin'))
const roleFirst = secrets('role_first', (ctx, record) => roles(ctx).includes('admin') || record!.api_secret == null)
// Rules that need the record throw a TypeError without one, which is how access resolution tells them apart.
const caught = secrets('caught', (_, record) => {
  try {
    return record!.api_secret == null
  } catch (error) {
    if (error instanceof TypeError) throw error
    return true
  }
})
const filtered = rowFilters.flatMap((filter, index) => [
  secrets(`row_filter_${index}`, (ctx) => roles(ctx).includes('admin') || filter),
  secrets(`record_filter_${index}`, (ctx, record) => record!.name === 'public' || roles(ctx).includes('admin') || filter),
])
// The docs' remedy: decide on a field that is not sensitive, which a change captured before its column existed lacks.
const flagged = resource('flagged')
  .table('flagged')
  .fields({ id: f.integer(), name: f.text(), has_secret: f.boolean().optional() })
  .primaryKey((r) => r.id)
  .access({ read: (ctx, record) => roles(ctx).includes('admin') || record!.has_secret === false })
// A role-only rule, which decides without the record.
const viewers = secrets('viewers', (ctx) => roles(ctx).includes('viewer'))
const notes = resource('notes').table('notes').fields({ id: f.integer(), name: f.text() }).primaryKey((r) => r.id).access({ read: (_, record) => record!.name !== 'hidden' })

const deps = { registry: buildRegistry([keys, notes, viewers, presence, roleFirst, caught, ...filtered, flagged]), accessOptions: {}, settingsResources: new Set() } as unknown as Deps
const change = (resource: string, after: Record<string, unknown>, rest: Partial<ResourceChange> = {}): ResourceChange => ({
  resource, key: '1', operation: 'create', after, changed: [], actor: null, source: 'api', databaseRole: null, transaction: '1', sequence: '1', at: '2026-10-21T00:00:00.000Z', ...rest,
})
const as = subscription('crm', { url: 'https://example.com/hook', events: ['*'], as: { roles: ['clerk'] } } as never)
const viewer = subscription('viewer', { url: 'https://example.com/hook', events: ['*'], as: { roles: ['viewer'] } } as never)
const admin = subscription('admin', { url: 'https://example.com/hook', events: ['*'], as: { roles: ['admin'] } } as never)
const unknownSecret = 'cannot tell whether the sensitive field "api_secret" is set'

describe('subscriberEvents', () => {
  it('fails a read rule that reads an encrypted field, which a captured record does not hold, rather than allowing it', async () => {
    // Capture leaves the secret out, set or not: the rule must not decide as if it were empty.
    await expect(subscriberEvents(deps)(as, change('keys', { id: 1, name: 'api' }), 'keys.created')).rejects.toThrow('cannot tell whether the sensitive field "secret" is set')
  })

  it('fails a read rule that reads a sensitive field, on a create, an update and a delete', async () => {
    const events = subscriberEvents(deps)
    const record = { id: 1, name: 'api' }
    await expect(events(viewer, change('presence', record), 'presence.created')).rejects.toThrow(unknownSecret)
    await expect(events(viewer, change('presence', record, { operation: 'update', before: record, changed: ['name', 'api_secret'] }), 'presence.updated')).rejects.toThrow(unknownSecret)
    const { after: _, ...deleted } = change('presence', record, { operation: 'delete', before: record })
    await expect(events(viewer, deleted, 'presence.deleted')).rejects.toThrow(unknownSecret)
  })

  it.each(rowFilters)('fails the row filter %s on a sensitive field, returned with or without the record', async (filter) => {
    const index = rowFilters.indexOf(filter)
    const events = subscriberEvents(deps)
    await expect(events(viewer, change(`row_filter_${index}`, { id: 1, name: 'api' }), 'created')).rejects.toThrow(unknownSecret)
    await expect(events(viewer, change(`record_filter_${index}`, { id: 1, name: 'api' }), 'created')).rejects.toThrow(unknownSecret)
  })

  it('fails a rule that catches the read of a sensitive field', async () => {
    await expect(subscriberEvents(deps)(viewer, change('caught', { id: 1, name: 'api' }), 'caught.created')).rejects.toThrow(unknownSecret)
  })

  it('delivers under a rule that checks the role before it reads a sensitive field, without that field', async () => {
    const events = subscriberEvents(deps)
    expect((await events(admin, change('role_first', { id: 1, name: 'api' }), 'role_first.created'))?.data.after).toEqual({ id: 1, name: 'api' })
    await expect(events(admin, change('presence', { id: 1, name: 'api' }), 'presence.created')).rejects.toThrow(unknownSecret)
  })

  it('decides on a field that is not sensitive, and fails when the captured change lacks it', async () => {
    const events = subscriberEvents(deps)
    expect((await events(viewer, change('flagged', { id: 1, name: 'api', has_secret: false }), 'flagged.created'))?.data.after).toEqual({ id: 1, name: 'api', has_secret: false })
    expect(await events(viewer, change('flagged', { id: 1, name: 'api', has_secret: true }), 'flagged.created')).toBeUndefined()
    expect(await events(viewer, change('flagged', { id: 1, name: 'api', has_secret: null }), 'flagged.created')).toBeUndefined()
    await expect(events(viewer, change('flagged', { id: 1, name: 'api' }), 'flagged.created')).rejects.toThrow('cannot tell whether the field "has_secret" is set')
  })

  it('still checks rules over fields a captured record holds', async () => {
    const events = subscriberEvents(deps)
    expect(await events(as, change('notes', { id: 1, name: 'hidden' }), 'notes.created')).toBeUndefined()
    expect((await events(as, change('notes', { id: 1, name: 'shown' }), 'notes.created'))?.data.after).toEqual({ id: 1, name: 'shown' })
  })
})

describe('eventChange', () => {
  const system = subscription('system', { url: 'https://example.com/hook', events: ['*'] } as never)
  const model = viewers.toModel()
  const update = change('viewers', { id: 1, name: 'api' }, { operation: 'update', before: { id: 1, name: 'old' }, changed: ['name', 'api_secret'] })
  const stored = subscriptionEvent(update, 'viewers.updated')
  const stale = { ...stored, data: { ...stored.data, after: { ...stored.data.after, api_secret: 'captured' }, before: { ...stored.data.before, api_secret: 'captured' } } }

  it('shapes a stored event again without a field that became sensitive, under the same id', async () => {
    const shaped = await subscriberEvents(deps)(system, eventChange(model, stale), stale.type)
    expect(shaped).toEqual(stored)
    expect((await subscriberEvents(deps)(viewer, eventChange(model, stale), stale.type))?.data).toMatchObject({ after: { id: 1, name: 'api' }, before: { id: 1, name: 'old' }, changed: ['name', 'api_secret'] })
  })

  it('drops a property an earlier release stored', async () => {
    const extra = { ...stored, record: { api_secret: 'captured' }, data: { ...stored.data, record: { api_secret: 'captured' } } }
    expect(JSON.stringify(await subscriberEvents(deps)(system, eventChange(model, extra), extra.type))).not.toContain('captured')
  })

  it("follows the subscription's roles as they are now", async () => {
    expect(await subscriberEvents(deps)(as, eventChange(model, stale), stale.type)).toBeUndefined()
  })

  it('sends a stored thin event only while the roles may read the resource', async () => {
    const thin = subscriptionEvent(update, 'viewers.updated', { thin: true })
    expect(await subscriberEvents(deps)(viewer, eventChange(model, thin), thin.type)).toEqual({ ...thin, data: { ...thin.data, changed: ['name', 'api_secret'] } })
    expect(await subscriberEvents(deps)(as, eventChange(model, thin), thin.type)).toBeUndefined()
  })
})
