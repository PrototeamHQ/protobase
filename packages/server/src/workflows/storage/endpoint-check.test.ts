import { describe, expect, it } from 'vitest'
import { endpointProblem } from './endpoint-check'

const publicHost = async () => ['93.184.216.34']

describe('endpointProblem', () => {
  it('takes an https origin the operator allows that resolves to public addresses', async () => {
    expect(await endpointProblem('https://storage.example.com', { endpoints: ['https://storage.example.com'], allowPrivateAddresses: false, resolve: publicHost })).toBeUndefined()
  })

  it('refuses an endpoint the operator does not allow, and any with no list', async () => {
    expect(await endpointProblem('https://other.example.com', { endpoints: ['https://storage.example.com'], allowPrivateAddresses: false, resolve: publicHost })).toBe('endpoint must be one the app allows: https://storage.example.com')
    expect(await endpointProblem('https://storage.example.com', { endpoints: [], allowPrivateAddresses: false, resolve: publicHost })).toBe('this app allows no endpoint: leave it out for the default host')
  })

  it('refuses plain http and anything but an origin', async () => {
    const rules = { endpoints: ['https://storage.example.com'], allowPrivateAddresses: false, resolve: publicHost }
    expect(await endpointProblem('http://storage.example.com', rules)).toBe('endpoint must be an https:// address')
    for (const given of ['https://user:pw@storage.example.com', 'https://storage.example.com/bucket', 'https://storage.example.com?x=1']) expect(await endpointProblem(given, rules)).toBe('endpoint must be an origin, with no path, user or query')
    expect(await endpointProblem('not a url', rules)).toBe('endpoint must be an https:// address')
  })

  it('refuses metadata, private, loopback and link-local addresses in every spelling, even when allowed', async () => {
    for (const given of ['https://169.254.169.254', 'https://10.0.0.1', 'https://192.168.1.1', 'https://127.0.0.1', 'https://[::1]', 'https://[::ffff:169.254.169.254]', 'https://[fd00::1]', 'https://[fe80::1]', 'https://0.0.0.0', 'https://2130706433', 'https://0x7f.0.0.1']) {
      const origin = new URL(given).origin
      expect(await endpointProblem(given, { endpoints: [origin], allowPrivateAddresses: false, resolve: publicHost }), given).toMatch(/is a private address/)
    }
  })

  it('refuses a name that resolves to a private address', async () => {
    const rules = { endpoints: ['https://storage.example.com'], allowPrivateAddresses: false, resolve: async () => ['93.184.216.34', '10.1.2.3'] }
    expect(await endpointProblem('https://storage.example.com', rules)).toBe('storage.example.com is a private address (10.1.2.3); storage reaches public addresses only')
  })
})
