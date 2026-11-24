import { describe, expect, it } from 'vitest'
import { resolveNames } from '../names/resolve-names'
import { keptNames, pinRefusal } from './kept-organizations'

const main = { id: 'main', name: 'Main', slug: 'main' }

describe('the organization pinned while organizations are off after being on', () => {
  it('is the default organization, pinned by a tenant equal to its id', () => {
    expect(pinRefusal({ default: main, tenant: 'main' })).toBeUndefined()
  })

  it('refuses a tenant unset, another one, or a number however alike, naming both', () => {
    expect(pinRefusal({ default: main })).toBe('Organizations were on and are off, so only the default organization works: set authenticate.tenant to its id, "main", which is unset')
    expect(pinRefusal({ default: main, tenant: 'other' })).toContain('"main", which is "other"')
    expect(pinRefusal({ default: { ...main, id: '1' }, tenant: 1 })).toContain('"1", which is 1')
  })

  it('refuses without a default organization', () => {
    expect(pinRefusal({ tenant: 'main' })).toContain('give auth.organizations.default the organization')
  })

  it('reads the member table as organizations on name it', () => {
    const names = resolveNames({ schema: 'auth', tables: { member: { name: 'people_in' } }, modules: ['auth'] })
    expect(String(keptNames(names).table('member'))).toBe('"auth"."people_in"')
  })
})
