import { describe, expect, it } from 'vitest'
import { f } from '../fields'
import { where } from '../filter'
import { resource } from '../resource'
import { checkRecord, resolveAccess } from './resolve'
import { defineRoles } from './roles'
import { rule } from './rule'
import type { AccessFn } from './types'

type Item = { name: string; ownerId: number; status: string }

const items = (rules: Partial<Record<'read' | 'list' | 'update' | 'create', AccessFn>>) =>
  resource('items')
    .table('items')
    .fields({ id: f.integer().readOnly().filterable(), name: f.text(), ownerId: f.integer().filterable(), status: f.text().filterable() })
    .primaryKey((r) => r.id)
    .owner((r) => r.ownerId)
    .access(rules)

const user = (id: number, ...roles: string[]) => ({ user: { id, roles } })
const notHidden = (_: unknown, record?: Item) => record!.name !== 'hidden'

describe('a list under a rule that needs the record', () => {
  const roles = defineRoles({ member: ['items.read.own'], admin: ['*'] })

  it('is refused, while the read stays record-checked', async () => {
    const access = await resolveAccess(items({ read: notHidden }), user(1))
    expect(access.operations).toMatchObject({ read: true, list: false })
    expect(access.recordChecks).toEqual(['read'])
  })

  it('is refused beside an explicit list rule, and for a record-reading list rule', async () => {
    const cases: Array<Partial<Record<'read' | 'list', AccessFn>>> = [
      { read: notHidden, list: () => true },
      { read: notHidden, list: () => 'status = "published"' },
      { read: () => true, list: notHidden },
      { read: roles.can('items.read').and(notHidden) },
      { read: rule(notHidden).and(roles.can('items.read')) },
      { read: roles.can('items.read').or(notHidden) },
      { read: rule(notHidden).or(roles.can('items.read')) },
    ]
    for (const rules of cases) {
      const access = await resolveAccess(items(rules), user(1, 'member'))
      expect(access.operations.list).toBe(false)
      expect(access.recordChecks).not.toContain('list')
    }
  })

  it('is refused for a rule that reads an encrypted field as text, which never gets a stored row', async () => {
    const given: unknown[] = []
    const people = resource('people')
      .table('people')
      .fields({ id: f.integer(), iban: f.text().optional().encrypted() })
      .primaryKey((r) => r.id)
      .access({ read: (_, record) => {
        given.push(record)
        return (record as { iban: string }).iban.startsWith('NL')
      } })
    const access = await resolveAccess(people, user(1))
    expect(access.operations).toMatchObject({ read: true, list: false })
    expect(JSON.stringify(given)).toBe('[{}]')
  })

  it('is refused for an anonymous caller too', async () => {
    const anonymous = defineRoles({ anonymous: [{ 'items.read': ['name', 'status'] }] })
    const published: AccessFn = (_, record) => (record as Item).status === 'published'
    const access = await resolveAccess(items({ read: published }), user(0, 'anonymous'), { roles: anonymous })
    expect(access.operations).toMatchObject({ read: true, list: false })
  })

  it('lists through a row filter, with the same filter as a get', async () => {
    const access = await resolveAccess(items({ read: (ctx) => where.eq('ownerId', ctx.user!.id as number) }), user(1))
    expect(access.operations).toMatchObject({ read: true, list: true })
    expect(access.recordChecks).toEqual([])
    expect(access.rowFilter.read).toMatchObject({ kind: 'compare' })
  })

  it('is refused only for the callers whose verdict needs the record', async () => {
    const adminOrOwner: AccessFn = (ctx, record) => ctx.user!.roles!.includes('admin') || (record as Item).ownerId === ctx.user!.id
    expect((await resolveAccess(items({ read: adminOrOwner }), user(1, 'admin'))).operations.list).toBe(true)
    expect((await resolveAccess(items({ read: adminOrOwner }), user(1, 'member'))).operations.list).toBe(false)
  })
})

describe('a rule that needs the record without throwing', () => {
  const rules: Array<[string, AccessFn]> = [
    ['a default parameter', (_, record: any = {}) => record.name !== 'hidden'],
    ['optional chaining', (_, record?: Item) => record?.status !== 'shipped'],
    ['rest arguments', (...args) => (args[1] as Item).name !== 'hidden'],
    ['ctx.record', (ctx) => (ctx.record as Item | undefined)?.name !== 'hidden'],
    ['the input', (_, __, input) => input?.status !== 'shipped'],
    ['an async read after an await', async (_, record?: Item) => {
      await null
      return record?.name !== 'hidden'
    }],
  ]

  it.each(rules)('is record-checked through %s', async (_, check) => {
    const access = await resolveAccess(items({ read: check, update: check }), user(1))
    expect(access.recordChecks).toEqual(['read', 'update'])
    expect(access.operations.list).toBe(false)
  })

  it('is detected when resolves run at the same time', async () => {
    const sync: AccessFn = (_, record?: Item) => record?.name !== 'hidden'
    const slow: AccessFn = async (_, record?: Item) => {
      await new Promise((resolve) => setTimeout(resolve, 5))
      return record?.name !== 'hidden'
    }
    const [a, b] = await Promise.all([resolveAccess(items({ read: slow }), user(1)), resolveAccess(items({ read: sync }), user(2))])
    expect(a.operations.list).toBe(false)
    expect(b.operations.list).toBe(false)
  })

  it('is checked against the real record, and a probe the rule kept trips nothing later', async () => {
    const kept: unknown[] = []
    const source = items({ update: (_, record?: Item) => {
      kept.push(record)
      return record?.status !== 'shipped'
    } })
    expect((await resolveAccess(source, user(1))).recordChecks).toEqual(['update'])
    expect(JSON.stringify(kept)).toBe('[{}]')
    expect('id' in (kept[0] as object)).toBe(false)
    expect(await checkRecord(source, user(1), 'update', { name: 'a', ownerId: 1, status: 'shipped' })).toBe(false)
    expect(await checkRecord(source, user(1), 'update', { name: 'a', ownerId: 1, status: 'draft' })).toBe(true)
  })

  it('still lets a rule that never reads the record decide', async () => {
    const access = await resolveAccess(items({ read: (ctx) => ctx.user!.id === 1, update: () => false }), user(1))
    expect(access.operations).toMatchObject({ read: true, list: true, update: false })
    expect(access.recordChecks).toEqual([])
  })
})
