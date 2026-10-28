import { describe, expect, it } from 'vitest'
import { sql } from 'kysely'
import { checkFilter, f, resource, where } from '@protobase/schema'
import { compiled } from '../../../test-support/compile-sql'
import { parentCondition, readConditions } from './read-conditions'

const channels = resource('channels').table('chat.channels')
  .fields({ id: f.integer(), tenant_id: f.integer(), member_ids: f.json().filterable(), deleted_at: f.timestamp().optional() })
  .primaryKey((r) => r.id).tenant((r) => r.tenant_id).softDelete((r) => r.deleted_at).toModel()
const messages = resource('messages').table('messages')
  .fields({ id: f.integer(), channel_id: f.relation('channels'), thread_id: f.relation('channels').optional() })
  .primaryKey((r) => r.id).toModel()
const members = checkFilter(channels, where.has('member_ids', 'alice'))
if (!members.ok) throw new Error('The test filter does not check')
const parent = { model: channels, key: channels.fields.id!, scope: { tenantValue: 7, rowFilter: members.filter } }

const text = (condition: ReturnType<typeof parentCondition>) => compiled(sql`${condition}`)

describe('parentCondition', () => {
  it("keeps the rows whose parent is inside the caller's scope on it, by one subquery on its key", () => {
    const { sql: query, parameters } = text(parentCondition({ field: messages.fields.channel_id!, parent }))
    expect(query).toBe('"t"."channel_id" in (select "t"."id" from "chat"."channels" as "t" where "t"."deleted_at" is null and "t"."tenant_id" = $1 and (jsonb_exists("t"."member_ids"::jsonb, $2) or "t"."member_ids"::jsonb @> to_jsonb($3::text)))')
    expect(parameters).toEqual([7, 'alice', 'alice'])
  })

  it('keeps the rows naming no parent when the relation is nullable', () => {
    expect(text(parentCondition({ field: messages.fields.thread_id!, parent })).sql).toMatch(/^\("t"\."thread_id" is null or "t"\."thread_id" in \(select /)
  })

  it('keeps no row naming a parent when the caller reads none', () => {
    expect(text(parentCondition({ field: messages.fields.channel_id! })).sql).toBe('false')
    expect(text(parentCondition({ field: messages.fields.thread_id! })).sql).toBe('("t"."thread_id" is null or false)')
  })

  it("follows the parent's own parents inside its subquery", () => {
    // A parent of the channel that the caller reads none of
    const nested = { ...parent, scope: { ...parent.scope, parents: [{ field: messages.fields.channel_id! }] } }
    expect(text(parentCondition({ field: messages.fields.channel_id!, parent: nested })).sql).toMatch(/ and false\)$/)
  })
})

describe('readConditions', () => {
  it('is empty for a table nothing narrows', () => {
    expect(readConditions(messages)).toEqual([])
  })
})
