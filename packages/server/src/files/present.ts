import { encodeKey } from '@protobase/schema'
import type { RequestAccess } from '../request-access'
import type { Row } from '../types'
import { downloadExpiry, signedDownloadUrl } from './download-url'
import { servedType } from './media-types'
import type { FilesRuntime } from './runtime'
import { parseUri } from './uri'

/** A file field as responses carry it; `missing` when the value does not parse or names a provider the config lacks. */
export type FileObject = { uri: string; name: string; type: string; size?: number; url?: string } | { uri: string; missing: true }

const fileObject = async (files: FilesRuntime, access: RequestAccess, row: Row, field: string, value: string, expires: number): Promise<FileObject> => {
  const ref = parseUri(value)
  const provider = ref && files.providers[ref.provider]
  if (!ref || !provider) return { uri: value, missing: true }
  const described = { uri: value, name: ref.name, type: servedType(ref.path), ...(ref.size !== undefined && { size: ref.size }) }
  if (provider.public) return { ...described, url: `${provider.publicUrl ?? `${files.path}/${ref.provider}`}/${ref.path}` }
  const key = access.full.primaryKey.map((name) => row[name])
  if (key.some((part) => typeof part !== 'string' && typeof part !== 'number')) return described
  const keyText = encodeKey(key as Array<string | number>)
  const url = await signedDownloadUrl(files.signer, files.path, { provider: ref.provider, path: ref.path, resource: access.entry.name, key: keyText, field, expires })
  return { ...described, url }
}

/**
 * Records as responses carry them: each readable file field as `{ uri, name, type, size, url }`. The URL is minted here,
 * after the ETag, for a caller who may already see the row: private files get a signed link to this row's field, public
 * ones their permanent address. Stored values, hooks and ETags only ever see the URI.
 */
export const presentFiles = async (access: RequestAccess, rows: Row[]): Promise<Row[]> => {
  const files = access.deps.files
  const fields = Object.values(access.model.fields).filter((field) => field.type === 'file')
  if (!files || fields.length === 0) return rows
  const expires = downloadExpiry()
  return Promise.all(rows.map(async (row) => {
    const shown = { ...row }
    for (const field of fields) {
      const value = row[field.name]
      if (typeof value === 'string') shown[field.name] = await fileObject(files, access, row, field.name, value, expires)
    }
    return shown
  }))
}
