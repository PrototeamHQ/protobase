import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { getMimeType } from 'hono/utils/mime'

export type StaticSite = {
  // Absolute folder with index.html and assets/.
  publicDir: string
  // The page a navigation to a path that is no file gets, relative to publicDir.
  spa: string
  // A shell of the server's own (absolute `dir`): it answers its `paths`, the root and navigations instead of the copy
  // in publicDir.
  shell?: { dir: string; paths: string[] }
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

// Vite names everything under an assets/ folder by its content hash, the shell's and each plugin's, so it never
// changes; the rest is revalidated.
const cacheControl = (root: string, file: string) =>
  path.relative(root, file).split(path.sep).slice(0, -1).includes('assets') ? 'public, max-age=31536000, immutable' : 'no-cache'

/**
 * Headers that keep every page of the UI out of other sites' frames, so none can put a click on a page of the app,
 * such as Allow on the connect page, under its own. A host that serves `public/` itself should send them too.
 */
export const frameHeaders = { 'x-frame-options': 'DENY', 'content-security-policy': "frame-ancestors 'none'" } as const

const fileResponse = async (root: string, file: string) =>
  new Response(await readFile(file), {
    headers: { 'content-type': getMimeType(file) ?? 'application/octet-stream', 'cache-control': cacheControl(root, file), ...frameHeaders },
  })

const isNavigation = (request: Request) => (request.headers.get('accept') ?? '').includes('text/html')

const isUnder = (paths: readonly string[], pathname: string) => paths.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))

// A built UI as a host serves it: the file a GET or HEAD names, else the SPA page for a navigation, else 404. With a
// shell of its own, the shell's paths and the SPA page come from it.
export const serveStaticSite = async ({ publicDir, spa, shell }: StaticSite, request: Request) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET, HEAD' } })
  const pathname = new URL(request.url).pathname
  const appDir = shell?.dir ?? publicDir
  const root = shell && (pathname === '/' || isUnder(shell.paths, pathname)) ? shell.dir : publicDir
  const file = await fileFor(root, pathname)
  if (file) return fileResponse(root, file)
  if (isNavigation(request)) return fileResponse(appDir, path.join(appDir, spa))
  return new Response('Not Found', { status: 404 })
}
