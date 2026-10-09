import { describe, expect, it } from 'vitest'
import { baseOrganization } from './base-organization'

describe('baseOrganization', () => {
  it('is organization 1, named after the app, in the Netherlands and in euros', () => {
    expect(baseOrganization('Acme Supply')).toEqual({ id: 1, name: 'Acme Supply', slug: 'acme-supply', country_code: 'NL', currency_code: 'EUR' })
  })

  it('makes a slug of any name', () => {
    expect(baseOrganization('Müller & Söhne B.V.').slug).toBe('muller-sohne-b-v')
    expect(baseOrganization('!!!').slug).toBe('organization')
  })

  it('refuses an empty name', () => {
    expect(() => baseOrganization('  ')).toThrow('name')
  })
})
