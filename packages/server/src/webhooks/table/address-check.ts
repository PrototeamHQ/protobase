import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

const v4 = (address: string) => address.split('.').map(Number) as [number, number, number, number]

// Loopback, private, link-local, carrier-grade NAT, "this network" and multicast or reserved.
const privateV4 = (address: string) => {
  const [a, b] = v4(address)
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b < 128) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b < 32) || (a === 192 && b === 168)
}

// The eight 16-bit groups of an IPv6 address, any spelling: compressed, with a dotted IPv4 tail or a zone.
const v6Groups = (address: string) => {
  const text = address.toLowerCase().replace(/%.*$/, '').replace(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/, (_, a, b, c, d) => `${((+a << 8) | +b).toString(16)}:${((+c << 8) | +d).toString(16)}`)
  const halves = text.split('::')
  if (halves.length > 2) return
  const groups = (half: string | undefined) => (half ? half.split(':') : [])
  const head = groups(halves[0])
  const tail = groups(halves[1])
  const zeros = halves.length === 2 ? 8 - head.length - tail.length : 0
  const all = [...head, ...Array<string>(Math.max(zeros, 0)).fill('0'), ...tail]
  if (all.length !== 8 || !all.every((group) => /^[0-9a-f]{1,4}$/.test(group))) return
  return all.map((group) => parseInt(group, 16))
}

const embeddedV4 = (high: number, low: number) => privateV4(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`)

// An IPv6 address that carries an IPv4 one (mapped, compatible, NAT64, 6to4) is judged by that; `::` and `::1` fall in 0/8.
const privateV6 = (address: string) => {
  const g = v6Groups(address)
  if (!g) return true
  const zeroUpTo = (end: number) => g.slice(0, end).every((group) => group === 0)
  if (zeroUpTo(5) && (g[5] === 0 || g[5] === 0xffff)) return embeddedV4(g[6]!, g[7]!)
  if (g[0] === 0x64 && g[1] === 0xff9b) return g.slice(2, 6).every((group) => group === 0) ? embeddedV4(g[6]!, g[7]!) : true
  if (g[0] === 0x2002) return embeddedV4(g[1]!, g[2]!)
  return (g[0]! & 0xfe00) === 0xfc00 || (g[0]! & 0xff80) === 0xfe80 || g[0]! >> 8 === 0xff
}

/**
 * Whether an IP address is one a webhook must not reach: the server's own host or network. Anything that is not an IP
 * address is refused too, so no unknown form gets through.
 */
export const isPrivateAddress = (address: string) => {
  const family = isIP(address)
  if (family === 4) return privateV4(address)
  if (family === 6) return privateV6(address)
  return true
}

/**
 * What is wrong with a URL whose host is, or resolves to, a private, loopback or link-local address, so a subscription someone
 * makes in the admin app cannot reach the server's own network. It gives the early error when a subscription is saved;
 * each delivery checks again in `pinnedRequest` and connects to the very address it checked, so a host that answers
 * differently later cannot steer it elsewhere.
 */
export const checkWebhookUrl = async (url: string) => {
  const target = new URL(url)
  if (target.protocol !== 'http:' && target.protocol !== 'https:') return `${target.protocol} URLs are not sent to; webhooks use http or https`
  const host = target.hostname.replace(/^\[|\]$/g, '')
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((entry) => entry.address)
  const blocked = addresses.find(isPrivateAddress)
  return blocked ? `${host} is a private address (${blocked}); webhooks reach public addresses only` : undefined
}
