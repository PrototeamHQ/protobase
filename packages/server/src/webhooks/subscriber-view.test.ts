import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import type { ResourceChange } from '../changes/resource-change'
import type { Deps } from '../deps'
import { buildRegistry } from '../registry'
import { subscriberEvents } from './subscriber-view'
import { subscription } from './subscription'

// A presence rule, as the docs teach for encrypted fields: only holders of `keys` see records whose secret is set.
const keys = resource('keys')
  .table('keys')
  .fields({ id: f.integer(), name: f.text(), secret: f.text().optional().encrypted() })
  .primaryKey((r) => r.id)
  .access({ read: (ctx, record) => record!.secret == null || (ctx.user?.roles ?? []).includes('keys') })
const notes = resource('notes').table('notes').fields({ id: f.integer(), name: f.text() }).primaryKey((r) => r.id).access({ read: (_, record) => record!.name !== 'hidden' })

const deps = { registry: buildRegistry([keys, notes]), accessOptions: {} } as unknown as Deps
const change = (resource: string, after: Record<string, unknown>): ResourceChange => ({
  resource, key: '1', operation: 'create', after, changed: [], actor: null, source: 'api', databaseRole: null, transaction: '1', sequence: '1', at: '2026-10-21T00:00:00.000Z',
})
const as = subscription('crm', { url: 'https://example.com/hook', events: ['*'], as: { roles: ['clerk'] } } as never)

describe('subscriberEvents', () => {
  it('fails a read rule that reads an encrypted field, which a captured record does not hold, rather than allowing it', async () => {
    // Capture leaves the secret out, set or not: the rule must not decide as if it were empty.
    await expect(subscriberEvents(deps)(as, change('keys', { id: 1, name: 'api' }), 'keys.created')).rejects.toThrow('cannot tell whether the encrypted field "secret" is set')
  })

  it('still checks rules over fields a captured record holds', async () => {
    const events = subscriberEvents(deps)
    expect(await events(as, change('notes', { id: 1, name: 'hidden' }), 'notes.created')).toBeUndefined()
    expect((await events(as, change('notes', { id: 1, name: 'shown' }), 'notes.created'))?.data.after).toEqual({ id: 1, name: 'shown' })
  })
})
