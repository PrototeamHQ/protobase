import { isIP } from 'node:net'

const fileOrExtension = /^(?:file|.+-extension):/i

// The host name of a Host header, or what kind of address literal it is.
const hostNameOf = (host: string) => {
  const trimmed = host.trim()
  if (trimmed.startsWith('[')) {
    const end = trimmed.indexOf(']')
    return end >= 0 && isIP(trimmed.slice(1, end)) === 6 ? { ip: true } : { invalid: true }
  }
  const colon = trimmed.indexOf(':')
  const name = colon === -1 ? trimmed : trimmed.slice(0, colon)
  return isIP(name) === 4 ? { ip: true } : { name }
}

/**
 * Whether Vite's dev server would serve a request with this Host header under `server.allowedHosts`, by Vite's own
 * rules, which it does not export: no Host, an IP literal, `localhost` and its subdomains pass; otherwise the name must
 * be listed, or be or end in an entry starting with `.`. It keeps a DNS-rebinding page off the API's sockets.
 */
export const isAllowedHost = (host: string | undefined, allowedHosts: true | readonly string[]) => {
  if (host === undefined || allowedHosts === true || fileOrExtension.test(host)) return true
  const parsed = hostNameOf(host)
  if ('invalid' in parsed) return false
  if ('ip' in parsed) return true
  const { name } = parsed
  if (name === 'localhost' || name.endsWith('.localhost')) return true
  return allowedHosts.some((allowed) => allowed === name || (allowed.startsWith('.') && (allowed.slice(1) === name || name.endsWith(allowed))))
}
