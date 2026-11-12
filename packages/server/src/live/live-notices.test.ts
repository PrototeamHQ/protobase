import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import type { ResourceChange } from '../changes/resource-change'
import { anyRecord, liveNotices } from './live-notices'

const table = (name: string) => resource(name).table(name).fields({ id: f.integer(), org_id: f.text() }).primaryKey((r) => r.id)
const messages = table('messages').toModel()
const replies = table('replies').live().toModel()
const audit = table('audit').toModel()
const thread = table('thread').live({ reads: ['messages', 'replies'] }).toModel()
const models = [messages, replies, audit, thread]

const change = (resource: string, key: string, tenant?: string) =>
  ({ resource, key, operation: 'create', ...(tenant !== undefined && { tenant }) }) as ResourceChange

describe('liveNotices', () => {
  it('refreshes a view when either table it reads changes, and keeps each live record change', () => {
    expect(liveNotices(models, [change('messages', '1')])).toEqual([{ resource: 'thread', key: anyRecord, operation: 'update' }])
    expect(liveNotices(models, [change('replies', '7')])).toEqual([change('replies', '7'), { resource: 'thread', key: anyRecord, operation: 'update' }])
  })

  it('makes no notice of a change in a table no live resource reads', () => {
    expect(liveNotices(models, [change('audit', '1')])).toEqual([])
  })

  it('refreshes a view once per batch and tenant', () => {
    const notices = liveNotices(models, [change('messages', '1', 'acme'), change('messages', '2', 'acme'), change('messages', '3', 'other')])
    expect(notices).toEqual([
      { resource: 'thread', key: anyRecord, operation: 'update', tenant: 'acme' },
      { resource: 'thread', key: anyRecord, operation: 'update', tenant: 'other' },
    ])
  })
})
