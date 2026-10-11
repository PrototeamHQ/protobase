import { describe, expect, it } from 'vitest'
import { checkWebhookUrl, isPrivateAddress } from './address-check'

describe('isPrivateAddress', () => {
  it('blocks loopback, private, link-local and similar addresses, in both families', () => {
    for (const address of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', '::', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1']) {
      expect([address, isPrivateAddress(address)]).toEqual([address, true])
    }
  })

  it('lets public addresses through', () => {
    for (const address of ['93.184.216.34', '172.32.0.1', '100.128.0.1', '2606:2800:220:1:248:1893:25c8:1946', '::ffff:93.184.216.34']) {
      expect([address, isPrivateAddress(address)]).toEqual([address, false])
    }
  })
})

describe('checkWebhookUrl', () => {
  it('refuses a URL whose host is a private address, without asking DNS', async () => {
    expect(await checkWebhookUrl('http://127.0.0.1:8080/hook')).toBe('127.0.0.1 is a private address (127.0.0.1); webhooks reach public addresses only')
    expect(await checkWebhookUrl('http://[::1]/hook')).toContain('::1 is a private address')
    expect(await checkWebhookUrl('https://93.184.216.34/hook')).toBeUndefined()
  })
})
