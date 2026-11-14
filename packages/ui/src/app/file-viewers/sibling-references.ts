import { fileNamed, type ViewedFile } from './file-viewer'

// Whether a reference's path climbs out of its folder with a `..` segment.
const climbs = (value: string) => value.split(/[?#]/, 1)[0]!.split('/').includes('..')

/**
 * The sibling a page's relative reference names, such as `shots/before.png` or `my%20chart.png`, by its file name
 * (`fileNamed`), as written or with its escapes read; none for an absolute or protocol-relative address, a path from
 * the root, a fragment, or a path that climbs out with `..`, written or escaped.
 */
export const siblingReference = <File extends ViewedFile>(siblings: readonly File[], reference: string) => {
  const value = reference.trim()
  const unescaped = decoded(value)
  if (climbs(value) || climbs(unescaped)) return
  return fileNamed(siblings, value) ?? fileNamed(siblings, unescaped)
}

// A reference with its escapes, such as `%20`, read; as it is when one is malformed.
const decoded = (value: string) => {
  try {
    return decodeURI(value)
  } catch (error) {
    if (error instanceof URIError) return value
    throw error
  }
}

/** `value` of a `srcset`, each candidate's address resolved on its own; a candidate `resolve` gives nothing for stays as written. */
export const rewriteSrcset = (value: string, resolve: (reference: string) => string | undefined) =>
  value
    .split(',')
    .map((candidate) => {
      const parts = /^(\s*)(\S+)([\s\S]*)$/.exec(candidate)
      const resolved = parts && resolve(parts[2]!)
      return parts && resolved ? `${parts[1]}${resolved}${parts[3]}` : candidate
    })
    .join(',')

/** CSS `text` with each `url(...)` resolved; one `resolve` gives nothing for stays as written. */
export const rewriteCssUrls = (text: string, resolve: (reference: string) => string | undefined) =>
  text.replace(/url\(\s*(['"]?)([^'")]*)\1\s*\)/gi, (whole, _quote: string, reference: string) => {
    const resolved = resolve(reference.trim())
    return resolved ? `url("${resolved}")` : whole
  })

/** An absolute `http:` or `https:` address as the URL parser reads it, else `undefined`, such as for `javascript:` or a relative path. */
export const externalUrl = (reference: string) => {
  if (!URL.canParse(reference)) return
  const url = new URL(reference)
  return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined
}
