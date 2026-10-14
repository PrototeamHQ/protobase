import { typeOfExtension } from './media-types'

// Printable ASCII without spaces: a URL as written, which the URL parser would otherwise trim or escape on its own.
const urlText = /^[\x21-\x7e]+$/

const scheme = 'https://'

/**
 * The URL an external file value names: an absolute `https:` URL with a host and no user name or password, written
 * out without spaces or control characters, its host first after `https://`; `undefined` for anything else, a provider
 * URI included.
 */
export const parseExternalUrl = (value: string) => {
  if (!value.startsWith(scheme) || !urlText.test(value) || !URL.canParse(value)) return undefined
  const url = new URL(value)
  if (url.username !== '' || url.password !== '' || !value.slice(scheme.length).toLowerCase().startsWith(url.host)) return undefined
  return url
}

const lastSegment = (path: string) => path.slice(path.lastIndexOf('/') + 1)

const decoded = (segment: string) => {
  try {
    return decodeURIComponent(segment)
  } catch (error) {
    if (error instanceof URIError) return segment
    throw error
  }
}

/** An external file's name and type: its path's last segment, else its host, and the type of that segment's extension. */
export const externalFile = (url: URL) => {
  const segment = decoded(lastSegment(url.pathname))
  return { name: segment || url.hostname, type: typeOfExtension(segment) }
}
