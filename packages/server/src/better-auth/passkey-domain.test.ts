import { describe, expect, it } from 'vitest'
import { passkeyHosts, readPasskeyDomain, resolvePasskeyDomain, signInPasskeyDomains } from './passkey-domain'

const origins = ['https://erp-x1.protobase.net', 'https://admin.shop.com', 'https://admin.shop.com:8443']

describe('resolvePasskeyDomain', () => {
  it('is the host of baseURL, the first origin, by default', () => {
    expect(resolvePasskeyDomain(undefined, origins)).toBe('erp-x1.protobase.net')
  })

  it('takes the host of any origin of the app, and nothing else', () => {
    expect(resolvePasskeyDomain('Admin.Shop.com', origins)).toBe('admin.shop.com')
    expect(() => resolvePasskeyDomain('shop.com', origins)).toThrow('erp-x1.protobase.net, admin.shop.com')
  })

  it('reads PROTOBASE_PASSKEY_DOMAIN', () => {
    expect(readPasskeyDomain({ PROTOBASE_PASSKEY_DOMAIN: ' admin.shop.com ' })).toBe('admin.shop.com')
    expect(readPasskeyDomain({ PROTOBASE_PASSKEY_DOMAIN: '' })).toBeUndefined()
  })
})

describe('signInPasskeyDomains', () => {
  // Counts the passkeys whose RP ID is any of the values asked for.
  const store = (rpIDs: Array<string | null>) => ({
    count: async ({ where = [] }: { where?: Array<{ value: unknown }> }) => rpIDs.filter((rpID) => where.some((condition) => condition.value === rpID)).length,
  })

  it('is the passkey domain alone on one origin, without asking the store', async () => {
    const unread = { count: () => Promise.reject(new Error('read')) }
    expect(await signInPasskeyDomains(unread, 'erp-x1.protobase.net', origins.slice(0, 1))).toEqual(['erp-x1.protobase.net'])
  })

  it('adds the other hosts that passkeys were made for, after the passkey domain', async () => {
    expect(await signInPasskeyDomains(store(['admin.shop.com']), 'admin.shop.com', origins)).toEqual(['admin.shop.com'])
    expect(await signInPasskeyDomains(store(['admin.shop.com', 'erp-x1.protobase.net']), 'admin.shop.com', origins)).toEqual(['admin.shop.com', 'erp-x1.protobase.net'])
  })

  it('counts passkeys made before they kept their RP ID for the host of baseURL', async () => {
    expect(await signInPasskeyDomains(store([null]), 'admin.shop.com', origins)).toEqual(['admin.shop.com', 'erp-x1.protobase.net'])
  })

  it('lists each host once, whatever the ports of its origins', () => {
    expect(passkeyHosts(origins)).toEqual(['erp-x1.protobase.net', 'admin.shop.com'])
  })
})
