/** What an `HtmlFrame`'s page asks of the app: follow its link `index`, or be as tall as `height` CSS pixels. */
export type FrameMessage = { kind: 'link'; index: number; newTab: boolean } | { kind: 'height'; height: number }

// Tall enough for a long report, short enough that a page cannot make the app's page endless.
const maxHeight = 100_000

/**
 * The request a message event carries from the frame's own window `frame`, with a link index below `links`; `undefined`
 * for any other source or shape. Every sandboxed page's origin is `"null"`, so only the window itself tells them apart.
 */
export const frameMessage = (event: Pick<MessageEvent, 'source' | 'data'>, frame: Window | null | undefined, links: number): FrameMessage | undefined => {
  if (!frame || event.source !== frame) return
  const data: unknown = event.data
  if (typeof data !== 'object' || data === null || !('protobase' in data) || data.protobase !== 'html-frame') return
  if ('link' in data && Number.isInteger(data.link) && (data.link as number) >= 0 && (data.link as number) < links) {
    return { kind: 'link', index: data.link as number, newTab: 'newTab' in data && data.newTab === true }
  }
  if ('height' in data && typeof data.height === 'number' && Number.isFinite(data.height) && data.height >= 0) {
    return { kind: 'height', height: Math.min(Math.ceil(data.height), maxHeight) }
  }
  return
}
