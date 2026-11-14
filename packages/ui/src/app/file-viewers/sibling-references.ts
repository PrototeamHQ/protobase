import { fileNamed, type ViewedFile } from './file-viewer'

/**
 * The sibling a page's relative reference names, such as `shots/before.png`, by its file name (`fileNamed`); none for
 * an absolute or protocol-relative address, a path from the root, a fragment, or a path that climbs out with `..`.
 */
export const siblingReference = <File extends ViewedFile>(siblings: readonly File[], reference: string) => {
  const value = reference.trim()
  if (value.split(/[?#]/, 1)[0]!.split('/').includes('..')) return
  return fileNamed(siblings, value)
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
