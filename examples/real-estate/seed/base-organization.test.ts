import { describe, expect, it } from 'vitest'
import { baseOrganization } from './base-organization'

describe('baseOrganization', () => {
  it('is organization 1, named after the app, with its city and KvK number left for the owner', () => {
    expect(baseOrganization('Acme Rentals')).toEqual({ id: 1, name: 'Acme Rentals', slug: 'acme-rentals', city: '', kvk_number: '' })
  })

  it('makes a slug of any name', () => {
    expect(baseOrganization('Grachtenhof Vastgoed B.V.').slug).toBe('grachtenhof-vastgoed-b-v')
    expect(baseOrganization('!!!').slug).toBe('organization')
  })

  it('refuses an empty name', () => {
    expect(() => baseOrganization('  ')).toThrow('name')
  })
})
