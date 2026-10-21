import { describe, expect, it } from 'vitest'
import { f, resource, type AnyField } from '@protobase/schema'
import { sharedColumnProblems } from './shared-columns'

const people = resource('people').table('people').fields({ id: f.integer(), org: f.text(), iban: f.text().encrypted() }).primaryKey((r) => r.id).tenant((r) => r.org).toModel()

const other = (table: string, iban: AnyField | null, o: { tenant?: 'org' | 'team'; key?: 'id' | 'code' } = {}) => {
  const built = resource('people_admin')
    .table(table)
    .fields({ id: f.integer(), code: f.text(), org: f.text(), team: f.text(), iban })
    .primaryKey((r) => r[o.key ?? 'id'])
  return (o.tenant === undefined ? built.tenant((r) => r.org) : built.tenant((r) => r[o.tenant!])).toModel()
}

describe('sharedColumnProblems', () => {
  it('refuses another resource that writes the column plain', () => {
    expect(sharedColumnProblems([people, other('people', f.text())])).toEqual([
      'people_admin.iban is over people.iban, which people encrypts: declare it .encrypted() too, with the same table, tenant and key, or leave the column out',
    ])
  })

  it('accepts one that encrypts it and binds alike, or leaves it out', () => {
    expect(sharedColumnProblems([people, other('people', f.text().encrypted())])).toEqual([])
    expect(sharedColumnProblems([people, other('people', null)])).toEqual([])
    const declared = { ...people, table: { schema: 'public', name: 'people' } }
    expect(sharedColumnProblems([declared, other('crm.people', f.text())])).toEqual([])
    expect(sharedColumnProblems([people, other('crm.people', f.text())])).toHaveLength(1)
  })

  it('refuses another field of the same resource over the column, plain or a relation', () => {
    const own = (extra: Record<string, AnyField>) => resource('people').table('people').fields({ id: f.integer(), iban: f.text().optional().encrypted(), ...extra }).primaryKey((r) => r.id).toModel()
    expect(sharedColumnProblems([own({ ibanPlain: f.text().optional().column('iban') })])).toEqual([
      'people.ibanPlain is over people.iban, which people.iban encrypts: leave the column out of it',
    ])
    expect(sharedColumnProblems([own({ account: f.relation('accounts').columns(['id', 'iban']).optional() })])).toHaveLength(1)
    expect(sharedColumnProblems([own({ note: f.text().optional() })])).toEqual([])
  })

  it('refuses a relation of another resource over the column', () => {
    const cards = resource('cards').table('people').fields({ id: f.integer(), org: f.text(), account: f.relation('accounts').columns(['id', 'iban']) }).primaryKey((r) => r.id).tenant((r) => r.org).toModel()
    expect(sharedColumnProblems([people, cards])).toEqual([
      'cards.account is over people.iban, which people encrypts: declare it .encrypted() too, with the same table, tenant and key, or leave the column out',
    ])
  })

  it('refuses one that binds differently', () => {
    expect(sharedColumnProblems([people, other('people', f.text().encrypted(), { tenant: 'team' })])).toHaveLength(2)
    expect(sharedColumnProblems([people, other('people', f.text().encrypted(), { key: 'code' })])).toHaveLength(2)
    expect(sharedColumnProblems([people, other('public.people', f.text().encrypted())])).toHaveLength(2)
  })
})
