import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { getMimeType } from 'hono/utils/mime'

export type StaticSite = {
  // Absolute folder with index.html and assets/.
  publicDir: string
  // The page a navigation to a path that is no file gets, relative to publicDir.
  spa: string
}

const missing = ['ENOENT', 'ENOTDIR']

const statOrUndefined = (file: string) =>
  stat(file).catch((error: NodeJS.ErrnoException) => {
    if (missing.includes(error.code ?? '')) return undefined
    throw error
  })

const decodePath = (pathname: string) => {
  try {
    return decodeURIComponent(pathname)
  } catch (error) {
    if (error instanceof URIError) return undefined
    throw error
  }
}

// The file a URL path names inside publicDir, a folder meaning its index.html; nothing outside publicDir.
const fileFor = async (publicDir: string, pathname: string) => {
  const decoded = decodePath(pathname)
  if (decoded === undefined || decoded.includes('\0')) return undefined
  const file = path.join(publicDir, decoded)
  if (file !== publicDir && !file.startsWith(`${publicDir}${path.sep}`)) return undefined
  const info = await statOrUndefined(file)
  if (info?.isFile()) return file
  if (!info?.isDirectory()) return undefined
  const index = path.join(file, 'index.html')
  return (await statOrUndefined(index))?.isFile() ? index : undefined
}

// Vite names everything under assets/ by its content hash, so it never changes; the rest is revalidated.
const cacheControl = (publicDir: string, file: string) =>
  file.startsWith(path.join(publicDir, 'assets', path.sep)) ? 'public, max-age=31536000, immutable' : 'no-cache'

const fileResponse = async (publicDir: string, file: string) =>
  new Response(await readFile(file), {
    headers: { 'content-type': getMimeType(file) ?? 'application/octet-stream', 'cache-control': cacheControl(publicDir, file) },
  })

const isNavigation = (request: Request) => (request.headers.get('accept') ?? '').includes('text/html')

// A built UI as a host serves it: the file a GET or HEAD names, else the SPA page for a navigation, else 404.
export const serveStaticSite = async ({ publicDir, spa }: StaticSite, request: Request) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET, HEAD' } })
  const file = await fileFor(publicDir, new URL(request.url).pathname)
  if (file) return fileResponse(publicDir, file)
  if (isNavigation(request)) return fileResponse(publicDir, path.join(publicDir, spa))
  return new Response('Not Found', { status: 404 })
}
