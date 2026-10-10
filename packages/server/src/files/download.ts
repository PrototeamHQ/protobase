import { HttpProblem, forbidden, notFound } from '../problem'
import type { Deps } from '../deps'
import { decodeKeyText } from '../key'
import { fetchRecord } from '../records'
import { readTransaction } from '../transactions'
import { readDownloadUrl } from './download-url'
import { downloadName, isInline, servedType } from './media-types'
import { baseOf, isFilePath, parseUri, tenantSegment } from './uri'

const gone = () => notFound('There is no such file')

// One `bytes=start-end` range, inclusive; `undefined` for none, `false` for one that cannot be served.
const rangeOf = (header: string | null, size: number) => {
  if (!header) return undefined
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match || (match[1] === '' && match[2] === '')) return false
  const start = match[1] === '' ? Math.max(size - Number(match[2]), 0) : Number(match[1])
  const end = match[1] === '' || match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1)
  return start <= end && start < size ? { start, end } : false
}

const disposition = (name: string, type: string) => {
  const ascii = name.replace(/[^\x20-\x7e]|["\\]/g, '_')
  return `${isInline(type) ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`
}

// The row behind a signed URL still holds this file, and the file sits under that row's tenant.
const grantedName = async (deps: Deps, provider: string, path: string, query: URLSearchParams) => {
  const read = await readDownloadUrl(deps.files!.signer, provider, path, query)
  if (read.status === 'invalid') throw forbidden('invalid-signature', 'This file link is not valid')
  if (read.status === 'expired') throw forbidden('link-expired', 'This file link expired; load the record again for a new one')
  const { grant } = read
  const entry = deps.registry.find(grant.resource)
  const field = entry?.model.fields[grant.field]
  if (!entry || field?.type !== 'file') throw gone()
  const tenantField = entry.model.tenant ? entry.model.fields[entry.model.tenant] : undefined
  const fields = tenantField ? [field, tenantField] : [field]
  const row = await readTransaction(deps.db, deps.statementTimeoutMs, (trx) => fetchRecord(trx, entry, decodeKeyText(entry, grant.key), undefined, { deleted: 'show', fields }))
  const value = row?.record[field.name]
  if (typeof value !== 'string' || baseOf(value) !== `${provider}:${path}`) throw gone()
  if (tenantField && path.split('/')[0] !== (await tenantSegment(row!.record[tenantField.name] as string | number))) throw gone()
  return { name: parseUri(value)?.name ?? path, expires: grant.expires }
}

/**
 * `GET <systemPath>/files/<provider>/<path>`: a public provider's file for anyone; a private one's only through a signed
 * URL whose row still holds it. The Content-Type comes from the path's extension, never from what was uploaded, and
 * nothing renders: `nosniff`, a sandboxing CSP, and `inline` only for images, PDF, audio and video.
 */
export const serveFile = async (deps: Deps, request: Request, provider: string, path: string) => {
  const configured = deps.files?.providers[provider]
  if (!configured || !isFilePath(path)) throw gone()
  const granted = configured.public ? undefined : await grantedName(deps, provider, path, new URL(request.url).searchParams)
  const object = await configured.store.head(path)
  if (!object) throw gone()

  const type = servedType(path)
  const name = downloadName(granted?.name ?? path.slice(path.lastIndexOf('/') + 1), type)
  const caching = granted ? `private, max-age=${Math.max(granted.expires - Math.floor(Date.now() / 1000), 0)}` : 'public, max-age=31536000, immutable'
  const headers: Record<string, string> = {
    'content-type': type,
    'content-disposition': disposition(name, type),
    'x-content-type-options': 'nosniff',
    'content-security-policy': "sandbox; default-src 'none'",
    'cache-control': caching,
    'accept-ranges': 'bytes',
  }
  const range = rangeOf(request.headers.get('range'), object.size)
  if (range === false) throw new HttpProblem(416, 'range-not-satisfiable', 'Range Not Satisfiable', 'The requested range is outside the file', {}, { 'content-range': `bytes */${object.size}` })
  const body = await configured.store.read(path, range)
  if (!body) throw gone()
  if (!range) return new Response(body, { status: 200, headers: { ...headers, 'content-length': String(object.size) } })
  return new Response(body, { status: 206, headers: { ...headers, 'content-length': String(range.end - range.start + 1), 'content-range': `bytes ${range.start}-${range.end}/${object.size}` } })
}
