/**
 * An origin pattern the operator lets the token exchange issue ID tokens for: an https origin whose host is exact,
 * such as `https://shop.example.com`, or starts with one wildcard label, such as `https://*.example.app`, which stands
 * for exactly one label (`shop.example.app`, never `example.app` or `a.b.example.app`). No port, path, query,
 * fragment or user info.
 */
export type AudiencePattern = { wildcard: boolean; labels: string[] }

// A DNS label as a hostname holds it once the URL parser has lowercased it and turned it into punycode.
const label = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

/** The pattern `text` stands for; anything else is an error naming it. */
export const parseAudiencePattern = (text: string): AudiencePattern => {
  const invalid = (why: string) => new Error(`auth.openIdProvider.audiences: "${text}" ${why}; give an https origin such as https://*.example.app`)
  const match = /^https:\/\/(\*\.)?([^/?#@:]+)$/.exec(text)
  if (!match) throw invalid('is not an https origin with at most one leading * label')
  const wildcard = match[1] !== undefined
  const host = match[2]!
  if (!URL.canParse(`https://${host}`) || new URL(`https://${host}`).hostname !== host) throw invalid('has a host that is not written as a lowercase hostname')
  const labels = host.split('.')
  if (!labels.every((part) => label.test(part))) throw invalid('has a host that is not a hostname')
  // A wildcard needs a fixed part of two labels at least, so `https://*.app` cannot take a whole top-level domain.
  if (wildcard && labels.length < 2) throw invalid('puts its wildcard right below a top-level domain')
  if (!wildcard && labels.length < 2) throw invalid('is not a public hostname')
  return { wildcard, labels }
}

/**
 * Whether `audience` is an origin one of `patterns` stands for. It must be an origin exactly as the URL parser writes
 * one (https, lowercase, no port, path, trailing slash, query or user info), and its host is matched label by label.
 */
export const matchesAudience = (patterns: readonly AudiencePattern[], audience: string) => {
  if (!URL.canParse(audience)) return false
  const url = new URL(audience)
  if (url.protocol !== 'https:' || url.origin !== audience || url.port !== '') return false
  const labels = url.hostname.split('.')
  return patterns.some((pattern) => {
    const fixed = pattern.labels
    if (labels.length !== fixed.length + (pattern.wildcard ? 1 : 0)) return false
    const rest = pattern.wildcard ? labels.slice(1) : labels
    if (pattern.wildcard && !label.test(labels[0]!)) return false
    return rest.every((part, index) => part === fixed[index])
  })
}

/**
 * Whether `url` is on a host one of `patterns` stands for, whatever its scheme, port or path, as a client id or a
 * redirect URI there would be.
 */
export const onAudienceHost = (patterns: readonly AudiencePattern[], url: unknown) =>
  typeof url === 'string' && URL.canParse(url) && new URL(url).hostname !== '' && matchesAudience(patterns, `https://${new URL(url).hostname}`)
