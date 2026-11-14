import { useMemo } from 'react'
import type { ViewedFile } from './file-viewer'
import { referencedSiblings, siblingPage, type LinkAddress, type SiblingPage } from './sibling-page'
import { siblingsKey } from './siblings-key'
import { useSiblingContents } from './use-sibling-contents'

/**
 * `html`, a page a file viewer shows, with its relative references resolved to `siblings` (`siblingPage`), for an
 * `HtmlFrame`: the images, videos and styles it names read as `data:` URLs, its links to siblings and outside addresses
 * in `links`, each showing the address `address` gives it. `undefined` while `html` or those reads are pending. Use it
 * inside a file viewer, which reads them from the API that serves the viewed record.
 */
export const useSiblingPage = <File extends ViewedFile>(html: string | undefined, siblings: readonly File[], address?: LinkAddress<File>): SiblingPage<File> | undefined => {
  // A viewer's siblings are a new list each render: their key, and the contents read, say when they changed.
  const siblingKey = siblingsKey(siblings)
  const named = useMemo(() => (html === undefined ? [] : referencedSiblings(html, siblings)), [html, siblingKey])
  const { contents, ready } = useSiblingContents(named)
  const contentsKey = [...contents.keys()].join('\n')
  return useMemo(() => (html === undefined || !ready ? undefined : siblingPage(html, siblings, contents, address)), [html, siblingKey, ready, contentsKey, address])
}
