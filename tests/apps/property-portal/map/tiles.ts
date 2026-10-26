import { createServer } from 'node:http'
import { Readable } from 'node:stream'
import type { ReadableStream } from 'node:stream/web'
import { tilesProxy } from './tiles-proxy'

// `bun run map:tiles`: the development map tiles at http://localhost:8790, which PROTOBASE_MAP_STYLE_URL in .env names.
const port = Number(process.env.PORT ?? 8790)
const proxy = tilesProxy(fetch)

createServer(async (incoming, outgoing) => {
  const headers = Object.entries(incoming.headers).flatMap(([name, value]): Array<[string, string]> => (typeof value === 'string' ? [[name, value]] : []))
  const answer = await proxy(new Request(`http://localhost:${port}${incoming.url ?? '/'}`, { method: incoming.method ?? 'GET', headers }))
  outgoing.writeHead(answer.status, Object.fromEntries(answer.headers))
  if (!answer.body) return outgoing.end()
  Readable.fromWeb(answer.body as ReadableStream).pipe(outgoing)
}).listen(port, () => console.log(`map tiles at http://localhost:${port}/style.json`))
