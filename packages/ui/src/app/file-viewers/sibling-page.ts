import type { ViewedFile } from './file-viewer'
import { linkAttribute } from './frame-bridge'
import { externalUrl, rewriteCssUrls, rewriteSrcset, siblingReference } from './sibling-references'

/** Where a link of a page in an `HtmlFrame` leads: a sibling file, or an outside `http`/`https` address. */
export type FrameLink<File extends ViewedFile = ViewedFile> = { kind: 'file'; file: File } | { kind: 'external'; url: string }

/** A page with its references to siblings resolved, and the targets of its links, which carry their index. */
export type SiblingPage<File extends ViewedFile = ViewedFile> = { html: string; links: FrameLink<File>[] }

// The attributes that load a file into the page, by the elements they are on.
const sources = ['img[src]', 'source[src]', 'video[src]', 'audio[src]', 'track[src]', 'input[src]'].join(', ')

// Each reference of `page` that loads a file, set to what `resource` gives for it; one it gives nothing for stays.
const rewriteResources = (page: Document, resource: (reference: string) => string | undefined) => {
  const set = (element: Element, attribute: string, value: string | undefined) => value !== undefined && element.setAttribute(attribute, value)
  for (const element of page.querySelectorAll(sources)) set(element, 'src', resource(element.getAttribute('src')!))
  for (const element of page.querySelectorAll('video[poster]')) set(element, 'poster', resource(element.getAttribute('poster')!))
  for (const element of page.querySelectorAll('img[srcset], source[srcset]')) set(element, 'srcset', rewriteSrcset(element.getAttribute('srcset')!, resource))
  for (const element of page.querySelectorAll('link[href]')) set(element, 'href', resource(element.getAttribute('href')!))
  for (const element of page.querySelectorAll('image[href]')) set(element, 'href', resource(element.getAttribute('href')!))
  for (const element of page.querySelectorAll('[style]')) set(element, 'style', rewriteCssUrls(element.getAttribute('style')!, resource))
  for (const element of page.querySelectorAll('style')) element.textContent = rewriteCssUrls(element.textContent, resource)
}

const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html')

/** The siblings `html` loads as images, videos, sounds, styles or fonts, each once: those a page needs read to show. */
export const referencedSiblings = <File extends ViewedFile>(html: string, siblings: readonly File[]) => {
  const found = new Set<File>()
  rewriteResources(parse(html), (reference) => {
    const sibling = siblingReference(siblings, reference)
    if (sibling) found.add(sibling)
    return
  })
  return [...found]
}

/**
 * `html` with each relative reference to a sibling resolved: one that loads a file to the `data:` URL `contents` holds
 * by its stored `uri`, a link to a sibling or to an outside `http`/`https` address to an entry of `links`. A reference
 * to no sibling, or to one `contents` lacks, stays as written; a link to anywhere else, such as `javascript:`, loses its
 * address. A link to a place on the page (`#top`) stays.
 */
export const siblingPage = <File extends ViewedFile>(html: string, siblings: readonly File[], contents: ReadonlyMap<string, string>): SiblingPage<File> => {
  const page = parse(html)
  for (const element of page.querySelectorAll(`[${linkAttribute}]`)) element.removeAttribute(linkAttribute)
  rewriteResources(page, (reference) => {
    const sibling = siblingReference(siblings, reference)
    return sibling && contents.get(sibling.uri)
  })

  const links: FrameLink<File>[] = []
  for (const link of page.querySelectorAll('a[href], area[href]')) {
    const href = link.getAttribute('href')!
    if (href.startsWith('#')) continue
    link.removeAttribute('target')
    const sibling = siblingReference(siblings, href)
    const url = sibling ? undefined : externalUrl(href)
    if (!sibling && !url) {
      link.removeAttribute('href')
      continue
    }
    link.setAttribute(linkAttribute, String(links.length))
    links.push(sibling ? { kind: 'file', file: sibling } : { kind: 'external', url: url! })
  }
  return { html: `<!doctype html>${page.documentElement.outerHTML}`, links }
}
