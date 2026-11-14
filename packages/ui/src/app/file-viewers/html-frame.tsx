import { useEffect, useMemo, useRef } from 'react'
import { cn } from '../../lib/cn'
import { useDocumentState } from './document-state'
import type { ViewedFile } from './file-viewer'
import { frameDocument } from './frame-document'
import { frameBox, nextFrameHeight, type FrameHeight } from './frame-height'
import { frameMessage } from './frame-messages'
import { frameNonce, frameSandbox, type FrameScripts } from './frame-policy'
import type { FrameLink } from './sibling-page'

const noLinks: readonly never[] = []

// Scrolls the app's page to the place `top` pixels down the page in `frame`, below the bars that stay at the top.
const scrollToPlace = (frame: HTMLIFrameElement, top: number) => {
  const bars = Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0
  window.scrollTo({ top: frame.getBoundingClientRect().top + window.scrollY + top - bars })
}

type HtmlFrameProps<File extends ViewedFile> = {
  /** The page, a whole HTML document or a fragment. */
  html: string
  /** The frame's accessible name, such as the file's name. */
  title: string
  /** The targets of the page's links, by the index each carries (`useSiblingPage`). */
  links?: readonly FrameLink<File>[]
  /** Follows a link of the page; `newTab` when it was a middle or modified click. */
  onLink?: (link: FrameLink<File>, options: { newTab: boolean }) => void
  /**
   * `'bridge'` (the default) runs none of the page's own scripts, for a page you do not trust, such as an uploaded file;
   * `'trusted-page'` runs them, for a page your viewer generates itself. Either way the page cannot reach the app.
   */
  scripts?: FrameScripts
  className?: string
}

/**
 * A whole HTML page drawn in a sandboxed frame with an opaque origin: it cannot read the app's cookies, storage or DOM,
 * call its API as the user, load anything from the network or navigate the app's window. Its links reach the app only
 * as the index of one of `links`, which `onLink` follows. The frame is as tall as its page, so the app's page scrolls,
 * unless the page is sized by the frame (`FrameHeight`).
 */
export const HtmlFrame = <File extends ViewedFile>({ html, title, links = noLinks, onLink, scripts = 'bridge', className }: HtmlFrameProps<File>) => {
  const frame = useRef<HTMLIFrameElement>(null)
  const shown = useMemo(() => {
    const nonce = frameNonce()
    return { nonce, srcDoc: frameDocument(html, scripts, nonce) }
  }, [html, scripts])
  const [height, setHeight] = useDocumentState<FrameHeight | undefined>(shown.nonce, undefined)
  // A page that navigated its frame anyway is shown again once; doing so again leaves the frame empty, until another
  // document is shown.
  const [shownAgain, setShownAgain] = useDocumentState(shown.nonce, 0)
  const key = `${shown.nonce}:${shownAgain}`
  // The loads of the frame shown as `key`: its first is its page, any later one the page leaving it.
  const loads = useRef({ key, count: 0 })

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      const message = frameMessage(event, frame.current?.contentWindow, links.length)
      const viewport = frame.current?.clientHeight
      if (message?.kind === 'height' && viewport !== undefined) setHeight((size) => nextFrameHeight(size, message.height, viewport))
      if (message?.kind === 'link') onLink?.(links[message.index]!, { newTab: message.newTab })
      if (message?.kind === 'scroll' && frame.current) scrollToPlace(frame.current, message.top)
    }
    window.addEventListener('message', receive)
    return () => window.removeEventListener('message', receive)
  }, [links, onLink, setHeight])

  const loaded = () => {
    if (loads.current.key !== key) loads.current = { key, count: 0 }
    loads.current.count += 1
    if (loads.current.count > 1) setShownAgain((times) => times + 1)
  }

  const box = frameBox(height)
  return (
    <iframe
      key={key}
      ref={frame}
      title={title}
      sandbox={frameSandbox}
      referrerPolicy="no-referrer"
      // A video's own fullscreen control; a page that does not run its scripts can ask for nothing else.
      allow={scripts === 'bridge' ? 'fullscreen' : undefined}
      srcDoc={shownAgain > 1 ? '' : shown.srcDoc}
      onLoad={loaded}
      className={cn('block w-full border-0 bg-white', box.className, className)}
      style={box.style}
    />
  )
}
