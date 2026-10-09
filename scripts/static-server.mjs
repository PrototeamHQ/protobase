import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'

const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' }

const forward = async (request, response, target) => {
  const upstream = await fetch(new URL(request.url, target), {
    method: request.method,
    headers: { accept: request.headers.accept ?? '*/*', 'content-type': request.headers['content-type'] ?? 'application/json', ...(request.headers['if-match'] && { 'if-match': request.headers['if-match'] }) },
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : request,
    duplex: 'half',
  })
  response.writeHead(upstream.status, Object.fromEntries(upstream.headers))
  response.end(Buffer.from(await upstream.arrayBuffer()))
}

/** Serves a built Storybook; `/api` goes to `proxyTarget` so Live stories find their server on the same origin. */
export const serveStatic = async (root, proxyTarget) => {
  const server = createServer(async (request, response) => {
    if (proxyTarget && request.url.startsWith('/api/')) return forward(request, response, proxyTarget)
    const path = normalize(decodeURIComponent(new URL(request.url, 'http://localhost').pathname))
    const file = join(root, path.endsWith('/') ? `${path}index.html` : path)
    if (!file.startsWith(root)) return response.writeHead(403).end()
    const body = await readFile(file).catch((error) => (error.code === 'ENOENT' ? null : Promise.reject(error)))
    if (!body) return response.writeHead(404).end()
    response.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' }).end(body)
  })
  await new Promise((resolve) => server.listen(0, resolve))
  return { base: `http://localhost:${server.address().port}`, close: () => server.close() }
}
