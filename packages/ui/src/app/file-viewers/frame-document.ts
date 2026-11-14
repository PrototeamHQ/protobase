import { frameBridge } from './frame-bridge'
import { frameCsp, type FrameScripts } from './frame-policy'

// What a page could use to leave its policy or the frame: its own `http-equiv` (a refresh, another policy), a `<base>`,
// and `<noscript>`, read as markup here but as text in the frame, where scripts run, so markup hidden in it would come
// out after these were removed.
const removed = 'meta[http-equiv], base, noscript'

/**
 * `html` as the page an `HtmlFrame` shows: parsed, cleared of `removed`, and opened with the frame's own policy, a
 * referrer policy that sends no address on, and the frame's link script carrying `nonce`. They are the first nodes of
 * `<head>`, put there in the parsed document, so the policy covers everything of the page, even a script written before
 * its `<html>`.
 */
export const frameDocument = (html: string, scripts: FrameScripts, nonce: string) => {
  const page = new DOMParser().parseFromString(html, 'text/html')
  for (const element of page.querySelectorAll(removed)) element.remove()

  const policy = page.createElement('meta')
  policy.httpEquiv = 'Content-Security-Policy'
  policy.content = frameCsp(scripts, nonce)
  const referrer = page.createElement('meta')
  referrer.name = 'referrer'
  referrer.content = 'no-referrer'
  const bridge = page.createElement('script')
  if (scripts === 'bridge') bridge.setAttribute('nonce', nonce)
  bridge.textContent = frameBridge
  page.head.prepend(policy, referrer, bridge)

  return `<!doctype html>${page.documentElement.outerHTML}`
}
