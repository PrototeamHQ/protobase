import { describe, expect, it } from 'vitest'
import { checkWebhookUrl, isPrivateAddress } from './address-check'

describe('isPrivateAddress', () => {
  it('blocks loopback, private, link-local and similar addresses, in both families', () => {
    for (const address of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '198.18.0.1', '198.19.255.255', '0.0.0.0', '::1', '::', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1',
      '::ffff:7f00:1', '::ffff:a00:1', '::ffff:a9fe:a9fe', '::a00:1', '::ffff:0:a00:1', '::ffff:0:127.0.0.1', '64:ff9b::a00:1', '64:ff9b:1::1', '2002:a00:1::1', 'fec0::1', 'fe80::1%eth0', 'ff02::1', '224.0.0.1', '240.0.0.1', '255.255.255.255']) {
      expect([address, isPrivateAddress(address)]).toEqual([address, true])
    }
  })

  it('lets public addresses through', () => {
    for (const address of ['93.184.216.34', '172.32.0.1', '100.128.0.1', '2606:2800:220:1:248:1893:25c8:1946', '::ffff:93.184.216.34', '::ffff:5db8:d822', '::ffff:0:5db8:d822', '64:ff9b::5db8:d822', '2002:5db8:d822::1']) {
      expect([address, isPrivateAddress(address)]).toEqual([address, false])
    }
  })

  it('refuses whatever is not an IP address, so no unknown form gets through', () => {
    for (const address of ['', 'hook.test', '1.2.3', '::g', '1:2:3:4:5:6:7:8:9', '127.0.0.1 ']) {
      expect([address, isPrivateAddress(address)]).toEqual([address, true])
    }
  })
})

describe('checkWebhookUrl', () => {
  it('refuses a URL whose host is a private address, without asking DNS', async () => {
    expect(await checkWebhookUrl('http://127.0.0.1:8080/hook')).toBe('127.0.0.1 is a private address (127.0.0.1); webhooks reach public addresses only')
    expect(await checkWebhookUrl('http://[::1]/hook')).toContain('::1 is a private address')
    expect(await checkWebhookUrl('https://93.184.216.34/hook')).toBeUndefined()
    expect(await checkWebhookUrl('http://[::ffff:10.0.0.1]/hook')).toContain('::ffff:a00:1 is a private address')
    expect(await checkWebhookUrl('ftp://93.184.216.34/hook')).toBe('ftp: URLs are not sent to; webhooks use http or https')
  })
})
