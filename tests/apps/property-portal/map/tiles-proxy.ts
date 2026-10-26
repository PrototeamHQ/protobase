/**
 * The development map tiles: the OpenMapTiles archive, sprites and fonts of the bucket below, which answers only its
 * own sites' origins. Served through this proxy they come with CORS headers for any origin, and the bucket's style,
 * which names the archive's old domain, names the proxy instead. The bucket is read, never written.
 */
export const tilesBucket = 'https://pub-aa7d484314e7429ebc2b0bcbc3c86bd8.r2.dev'

// The domain the bucket's style.json was written for, which no longer serves it.
const styleDomain = 'https://map.rentnudge.com'

// What a range read of the archive needs back: its part, and the ETag pmtiles checks it against.
const passedHeaders = ['content-type', 'content-range', 'accept-ranges', 'etag', 'last-modified', 'cache-control']

const cors = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range, etag', 'access-control-allow-headers': 'range, if-match' }

// What the archive's data asks to be credited with, which its metadata leaves out.
const attribution = '<a href="https://openmaptiles.org/" target="_blank">© OpenMapTiles</a> <a href="https://www.openstreetmap.org/copyright" target="_blank">© OpenStreetMap contributors</a>'

type Style = { sources: Record<string, { attribution?: string }> }

/** The bucket's style with its sources, sprite and fonts at `origin`, each source credited. */
export const proxiedStyle = (text: string, origin: string) => {
  const style = JSON.parse(text.replaceAll(styleDomain, origin)) as Style
  for (const source of Object.values(style.sources)) source.attribution ??= attribution
  return JSON.stringify(style)
}

/**
 * Answers the bucket's files at the same paths, `/style.json` pointing at itself; `upstream` fetches from the bucket.
 * Only reads: a GET or HEAD, with its `Range` passed on, and the CORS preflight that a range read can ask first.
 */
export const tilesProxy = (upstream: typeof fetch) => async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, 'access-control-allow-methods': 'GET, HEAD' } })
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Only GET and HEAD', { status: 405, headers: cors })
  const url = new URL(request.url)
  const range = request.headers.get('range')
  const answer = await upstream(`${tilesBucket}${url.pathname}`, { method: request.method, headers: range ? { range } : {} })
  const headers = new Headers(cors)
  for (const name of passedHeaders) {
    const value = answer.headers.get(name)
    if (value !== null) headers.set(name, value)
  }
  if (url.pathname !== '/style.json' || !answer.ok) return new Response(answer.body, { status: answer.status, headers })
  // The style is the proxy's own text: it changes with the proxy, so a browser asks for it each time
  for (const name of ['etag', 'last-modified']) headers.delete(name)
  headers.set('cache-control', 'no-cache')
  return new Response(proxiedStyle(await answer.text(), url.origin), { status: answer.status, headers })
}
