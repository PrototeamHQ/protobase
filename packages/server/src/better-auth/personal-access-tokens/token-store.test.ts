import type { DBAdapter } from 'better-auth'
import { describe, expect, it } from 'vitest'
import { inOrganization, signInOrganization } from '../../organization-scope/sign-in-organization'
import { findTokenByHash, noteUse, storeToken, type PersonalAccessTokenRow } from './token-store'

const row: PersonalAccessTokenRow = { id: 't1', userId: 'ana', name: 'Script', tokenHash: 'hash', role: 'sales', organizationId: 'acme', createdAt: new Date('2026-01-01') }

// An adapter that notes the organization sign-in's queries worked in, by what it was asked.
const recording = () => {
  const worked: [string, unknown][] = []
  const note = (call: string) => worked.push([call, signInOrganization()])
  const adapter = {
    findOne: async () => (note('findOne'), row),
    create: async () => (note('create'), row),
    update: async () => (note('update'), row),
  } as unknown as Pick<DBAdapter, 'findOne' | 'create' | 'update'>
  return { adapter, worked }
}

describe('the store of personal access tokens', () => {
  it('looks a token up by its hash across organizations, as the hash is unique across the app, outside any request too', async () => {
    const { adapter, worked } = recording()
    expect(await findTokenByHash(adapter, 'hash')).toEqual(row)
    expect(await inOrganization('other', () => findTokenByHash(adapter, 'hash'))).toEqual(row)
    expect(worked).toEqual([
      ['findOne', { unscoped: 'a token is looked up by its hash, a key unique across the app, before its organization is known' }],
      ['findOne', { unscoped: 'a token is looked up by its hash, a key unique across the app, before its organization is known' }],
    ])
  })

  it('stores a token and notes its use in the organization it works in', async () => {
    const { adapter, worked } = recording()
    const { id: _, lastUsedAt: __, ...data } = row
    await storeToken(adapter, data)
    await noteUse(adapter, row, new Date('2026-01-02'))
    expect(worked).toEqual([
      ['create', 'acme'],
      ['update', 'acme'],
    ])
  })
})
