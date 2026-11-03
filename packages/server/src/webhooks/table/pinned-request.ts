import { lookup } from 'node:dns/promises'
import { request as httpRequest, type IncomingMessage } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { isIP, type LookupFunction } from 'node:net'
import { Readable } from 'node:stream'
import { isPrivateAddress } from './address-check'

/** The addresses a host name resolves to. */
export type Resolve = (host: string) => Promise<string[]>

/** The system resolver, every address of the host. */
export const resolveHost: Resolve = async (host) => (await lookup(host, { all: true })).map((entry) => entry.address)

/** A request refused before it was sent, for its URL's scheme or address. The message names the host, never the URL. */
export class AddressRefusedError extends Error {}

export type PinnedInit = { method: string; headers?: HeadersInit; body?: string; signal?: AbortSignal }

export type PinnedOptions = {
  /** Default: the system resolver (`resolveHost`). */
  resolve?: Resolve
  /** Lets the request reach private, loopback and link-local addresses, for development and tests. Default false. */
  allowPrivateAddresses?: boolean
  /** Trusts these certificates in place of the system's, for tests. */
  ca?: string | Buffer
}

// The client must never resolve the host itself: it is only ever given the checked address.
const noLookup: LookupFunction = (_host, _options, callback) => callback(new Error('A pinned request resolves no host'), '', 4)

const resolveWithin = (resolve: Resolve, host: string, signal?: AbortSignal) => {
  signal?.throwIfAborted()
  if (!signal) return resolve(host)
  return Promise.race([resolve(host), new Promise<never>((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))])
}

// The addresses to choose from, all checked: an IP-literal host as it stands, a name as the resolver answers.
const checkedAddresses = async (host: string, options: PinnedOptions, signal?: AbortSignal) => {
  const addresses = isIP(host) ? [host] : await resolveWithin(options.resolve ?? resolveHost, host, signal)
  if (addresses.length === 0) throw new AddressRefusedError(`${host} resolves to no address`)
  const notIp = addresses.find((address) => typeof address !== 'string' || isIP(address) === 0)
  if (notIp !== undefined) throw new AddressRefusedError(`${host} resolves to something that is not an IP address`)
  const blocked = options.allowPrivateAddresses ? undefined : addresses.find(isPrivateAddress)
  if (blocked !== undefined) throw new AddressRefusedError(`${host} is a private address (${blocked}); requests reach public addresses only`)
  return addresses
}

const nullBodyStatuses = new Set([204, 205, 304])

// The answer as a fetch `Response`; its status is one a `Response` can hold, 200 to 599.
const toResponse = (message: IncomingMessage, status: number) => {
  const headers = new Headers()
  for (let index = 0; index < message.rawHeaders.length; index += 2) headers.append(message.rawHeaders[index]!, message.rawHeaders[index + 1]!)
  if (nullBodyStatuses.has(status)) {
    message.resume()
    return new Response(null, { status, headers })
  }
  return new Response(Readable.toWeb(message) as ReadableStream, { status, headers })
}

/**
 * An http(s) request to a URL someone else chose, which reaches only the address it checked. It resolves the host once,
 * refuses it unless every address is public (or `allowPrivateAddresses`), and connects to the first one, with the host
 * name as the `Host` header and as the TLS server name the certificate is checked against. A redirect is returned as
 * it is and never followed: a caller that follows one calls this again with its URL, so the new host is checked too.
 */
export const pinnedRequest = async (url: string, init: PinnedInit, options: PinnedOptions = {}) => {
  const target = new URL(url)
  if (target.protocol !== 'http:' && target.protocol !== 'https:') throw new AddressRefusedError(`${target.protocol} URLs are not requested; use http or https`)
  const host = target.hostname.replace(/^\[|\]$/g, '')
  const address = (await checkedAddresses(host, options, init.signal))[0]!
  const headers = Object.fromEntries(new Headers(init.headers))
  if (init.body !== undefined) headers['content-length'] = String(Buffer.byteLength(init.body))
  headers.host = target.host
  const send = target.protocol === 'https:' ? httpsRequest : httpRequest
  return new Promise<Response>((resolve, reject) => {
    const request = send(
      {
        host: address,
        family: isIP(address),
        port: target.port || (target.protocol === 'https:' ? 443 : 80),
        path: `${target.pathname}${target.search}`,
        method: init.method,
        headers,
        lookup: noLookup,
        ...(isIP(host) === 0 && { servername: host }),
        ...(options.ca && { ca: options.ca }),
        ...(init.signal && { signal: init.signal }),
      },
      (message) => {
        const status = message.statusCode ?? 0
        if (status >= 200 && status <= 599) return resolve(toResponse(message, status))
        message.destroy()
        reject(new Error(`${host} answered with status ${status}`))
      },
    )
    request.on('error', reject)
    request.end(init.body)
  })
}
