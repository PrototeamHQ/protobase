import { describe, expect, it } from 'vitest'
import { proxiedStyle, tilesBucket, tilesProxy } from './tiles-proxy'

const style = JSON.stringify({
  sources: { openmaptiles: { type: 'vector', url: 'pmtiles://https://map.rentnudge.com/20250819.pmtiles' } },
  sprite: 'https://map.rentnudge.com/sprites/v4/light',
  glyphs: 'https://map.rentnudge.com/fonts/{fontstack}/{range}.pbf',
})

// The bucket as the proxy sees it: what it was asked, and the answer it gives.
const bucket = (answer: () => Response) => {
  const asked: Array<{ url: string; init: RequestInit | undefined }> = []
  const upstream = (async (url: string, init?: RequestInit) => {
    asked.push({ url, init })
    return answer()
  }) as typeof fetch
  return { asked, proxy: tilesProxy(upstream) }
}

describe('proxiedStyle', () => {
  it("points the style's archive, sprite and fonts at the proxy, and credits OpenMapTiles and OpenStreetMap", () => {
    expect(JSON.parse(proxiedStyle(style, 'http://localhost:8790'))).toEqual({
      sources: { openmaptiles: { type: 'vector', url: 'pmtiles://http://localhost:8790/20250819.pmtiles', attribution: expect.stringContaining('© OpenStreetMap contributors') } },
      sprite: 'http://localhost:8790/sprites/v4/light',
      glyphs: 'http://localhost:8790/fonts/{fontstack}/{range}.pbf',
    })
  })

  it('keeps the credit a source has', () => {
    const credited = JSON.stringify({ sources: { own: { type: 'vector', url: 'pmtiles://https://map.rentnudge.com/x.pmtiles', attribution: '© Us' } } })
    expect(JSON.parse(proxiedStyle(credited, 'http://localhost:8790')).sources.own.attribution).toBe('© Us')
  })
})

describe('tilesProxy', () => {
  it('reads a part of the archive from the bucket, with the headers pmtiles needs and CORS for any origin', async () => {
    const { asked, proxy } = bucket(() => new Response('tile', { status: 206, headers: { 'content-type': 'application/octet-stream', 'content-range': 'bytes 0-3/2140453952', etag: '"v1"', server: 'cloudflare' } }))
    const answer = await proxy(new Request('http://localhost:8790/20250819.pmtiles', { headers: { range: 'bytes=0-3', origin: 'http://localhost:5173' } }))
    expect(asked).toEqual([{ url: `${tilesBucket}/20250819.pmtiles`, init: { method: 'GET', headers: { range: 'bytes=0-3' } } }])
    expect(answer.status).toBe(206)
    expect(await answer.text()).toBe('tile')
    expect(Object.fromEntries(answer.headers)).toEqual({
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'range, if-match',
      'access-control-expose-headers': 'content-range, etag',
      'content-type': 'application/octet-stream',
      'content-range': 'bytes 0-3/2140453952',
      etag: '"v1"',
    })
  })

  it("serves the bucket's style pointing at itself", async () => {
    const { asked, proxy } = bucket(() => new Response(style, { headers: { 'content-type': 'application/json', etag: '"style"', 'last-modified': 'Tue, 19 Aug 2025 18:42:32 GMT' } }))
    const answer = await proxy(new Request('http://localhost:8790/style.json'))
    expect(asked[0]!.url).toBe(`${tilesBucket}/style.json`)
    expect(JSON.parse(await answer.text()).sprite).toBe('http://localhost:8790/sprites/v4/light')
    expect(answer.headers.get('etag')).toBeNull()
    expect(answer.headers.get('last-modified')).toBeNull()
    expect(answer.headers.get('cache-control')).toBe('no-cache')
    expect(answer.headers.get('access-control-allow-origin')).toBe('*')
  })

  it("passes on the bucket's errors as they are", async () => {
    const { proxy } = bucket(() => new Response('missing', { status: 404 }))
    const answer = await proxy(new Request('http://localhost:8790/style.json'))
    expect(answer.status).toBe(404)
    expect(await answer.text()).toBe('missing')
  })

  it('answers the CORS preflight itself, and only reads', async () => {
    const { asked, proxy } = bucket(() => new Response('never'))
    const preflight = await proxy(new Request('http://localhost:8790/20250819.pmtiles', { method: 'OPTIONS' }))
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-methods')).toBe('GET, HEAD')
    expect((await proxy(new Request('http://localhost:8790/style.json', { method: 'PUT', body: '{}' }))).status).toBe(405)
    expect(asked).toEqual([])
  })
})
