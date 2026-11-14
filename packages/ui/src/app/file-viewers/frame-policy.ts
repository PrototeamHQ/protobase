/**
 * What an `HtmlFrame`'s page may run: `'bridge'`, only the frame's own link script, for a page it does not trust, such
 * as an uploaded file; `'trusted-page'`, also the page's own inline scripts, for a page an app generates itself.
 */
export type FrameScripts = 'bridge' | 'trusted-page'

/**
 * The frame's sandbox: scripts, so the link script runs, and nothing else. Never `allow-same-origin`, so the page has an
 * opaque origin and cannot reach the app's cookies, storage or DOM; no top navigation, forms or popups.
 */
export const frameSandbox = 'allow-scripts'

/**
 * The page's Content-Security-Policy. With `'bridge'` only the script carrying `nonce` runs: the page's own scripts,
 * inline handlers and `javascript:` links do not. `'trusted-page'` runs inline scripts and so carries no nonce, which
 * would turn `'unsafe-inline'` off. Either way nothing loads from the network: images, media, styles and fonts come
 * from `data:` URLs, and nothing is fetched, framed or submitted.
 */
export const frameCsp = (scripts: FrameScripts, nonce: string) =>
  [
    "default-src 'none'",
    scripts === 'bridge' ? `script-src 'nonce-${nonce}'` : "script-src 'unsafe-inline'",
    'img-src data:',
    'media-src data:',
    "style-src 'unsafe-inline' data:",
    'font-src data:',
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ')

/** A fresh 128-bit nonce, as hex. */
export const frameNonce = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('')
