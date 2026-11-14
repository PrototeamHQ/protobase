import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '../../lib/cn'
import type { ViewedFile } from './file-viewer'
import { frameDocument } from './frame-document'
import { frameMessage } from './frame-messages'
import { frameNonce, frameSandbox, type FrameScripts } from './frame-policy'
import type { FrameLink } from './sibling-page'

const noLinks: readonly never[] = []

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
 * as the index of one of `links`, which `onLink` follows. The frame is as tall as its page, so the app's page scrolls.
 */
export const HtmlFrame = <File extends ViewedFile>({ html, title, links = noLinks, onLink, scripts = 'bridge', className }: HtmlFrameProps<File>) => {
  const frame = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState<number>()
  // A page that navigated its frame anyway is shown again once; doing so again leaves the frame empty.
  const [shownAgain, setShownAgain] = useState(0)
  const shown = useMemo(() => {
    const nonce = frameNonce()
    return { nonce, srcDoc: frameDocument(html, scripts, nonce) }
  }, [html, scripts])
  const key = `${shown.nonce}:${shownAgain}`
  // The loads of the frame shown as `key`: its first is its page, any later one the page leaving it.
  const loads = useRef({ key, count: 0 })

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      const message = frameMessage(event, frame.current?.contentWindow, links.length)
      if (message?.kind === 'height') setHeight(message.height)
      if (message?.kind === 'link') onLink?.(links[message.index]!, { newTab: message.newTab })
    }
    window.addEventListener('message', receive)
    return () => window.removeEventListener('message', receive)
  }, [links, onLink])

  const loaded = () => {
    if (loads.current.key !== key) loads.current = { key, count: 0 }
    loads.current.count += 1
    if (loads.current.count > 1) setShownAgain((times) => times + 1)
  }

  return (
    <iframe
      key={key}
      ref={frame}
      title={title}
      sandbox={frameSandbox}
      referrerPolicy="no-referrer"
      srcDoc={shownAgain > 1 ? '' : shown.srcDoc}
      onLoad={loaded}
      className={cn('block w-full border-0 bg-white', height === undefined && 'min-h-[60vh]', className)}
      style={height === undefined ? undefined : { height }}
    />
  )
}
