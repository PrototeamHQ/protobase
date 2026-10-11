import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

const v4 = (address: string) => address.split('.').map(Number) as [number, number, number, number]

// Loopback, private, link-local, carrier-grade NAT, "this network" and multicast or reserved.
const privateV4 = (address: string) => {
  const [a, b] = v4(address)
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b < 128) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b < 32) || (a === 192 && b === 168)
}

const privateV6 = (address: string) => {
  const lower = address.toLowerCase()
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower)
  if (mapped) return privateV4(mapped[1]!)
  return lower === '::' || lower === '::1' || /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower) || /^ff/.test(lower)
}

/** Whether an IP address is one a webhook must not reach: the server's own host or network. */
export const isPrivateAddress = (address: string) => (isIP(address) === 4 ? privateV4(address) : privateV6(address))

/**
 * What is wrong with a URL whose host is, or resolves to, a private, loopback or link-local address, so a subscription someone
 * makes in the admin app cannot reach the server's own network. The address is resolved again when the request is
 * sent, so a host that answers differently the second time still gets through: a firewall rule is the stronger guard.
 */
export const checkWebhookUrl = async (url: string) => {
  const host = new URL(url).hostname.replace(/^\[|\]$/g, '')
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((entry) => entry.address)
  const blocked = addresses.find(isPrivateAddress)
  return blocked ? `${host} is a private address (${blocked}); webhooks reach public addresses only` : undefined
}
