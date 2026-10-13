import { encodeKey, type FieldModel } from '@protobase/schema'
import type { RequestAccess } from '../request-access'
import type { Row } from '../types'
import { downloadExpiry, signedDownloadUrl } from './download-url'
import { servedType } from './media-types'
import type { FilesRuntime } from './runtime'
import { parseUri, variantPaths, type FileRef } from './uri'

/** An image variant of a file: its link and type, and the box the field resizes it into, as configured now. */
export type FileVariantObject = { url: string; type: string; width?: number; height?: number }

/**
 * A file field as responses carry it; `missing` when the value does not parse or names a provider the config lacks.
 * `placeholder` is the ThumbHash of its placeholder field, when the row holds one.
 */
export type FileObject =
  | { uri: string; name: string; type: string; size?: number; url?: string; placeholder?: string; variants?: Record<string, FileVariantObject> }
  | { uri: string; missing: true }

// How to link a file's paths for this caller: a public provider's permanent address, or a signed link to this row's field.
const linker = async (files: FilesRuntime, access: RequestAccess, row: Row, field: string, ref: FileRef, expires: number) => {
  const provider = files.providers[ref.provider]!
  if (provider.public) return async (path: string) => `${provider.publicUrl ?? `${files.path}/${ref.provider}`}/${path}`
  const key = access.full.primaryKey.map((name) => row[name])
  if (key.some((part) => typeof part !== 'string' && typeof part !== 'number')) return undefined
  const keyText = encodeKey(key as Array<string | number>)
  return (path: string) => signedDownloadUrl(files.signer, files.path, { provider: ref.provider, path, resource: access.entry.name, key: keyText, field, expires })
}

const fileObject = async (files: FilesRuntime, access: RequestAccess, row: Row, field: FieldModel, value: string, expires: number): Promise<FileObject> => {
  const ref = parseUri(value)
  if (!ref || !files.providers[ref.provider]) return { uri: value, missing: true }
  const target = field.file?.placeholder
  const placeholder = target !== undefined && access.model.fields[target] ? row[target] : undefined
  const described = { uri: value, name: ref.name, type: servedType(ref.path), ...(ref.size !== undefined && { size: ref.size }), ...(typeof placeholder === 'string' && { placeholder }) }
  const link = await linker(files, access, row, field.name, ref, expires)
  if (!link) return described
  const variants: Record<string, FileVariantObject> = {}
  for (const [name, path] of Object.entries(variantPaths(ref))) {
    const box = field.file?.variants?.[name]
    variants[name] = { url: await link(path), type: servedType(path), ...(box?.width !== undefined && { width: box.width }), ...(box?.height !== undefined && { height: box.height }) }
  }
  return { ...described, url: await link(ref.path), ...(Object.keys(variants).length > 0 && { variants }) }
}

/**
 * Records as responses carry them: each readable file field as `{ uri, name, type, size, url }`, with its `variants` and
 * `placeholder` when it has them. The URLs are minted here, after the ETag, for a caller who may already see the row:
 * private files get a signed link to this row's field, public ones their permanent address. Stored values, hooks and
 * ETags only ever see the URI.
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
      if (typeof value === 'string') shown[field.name] = await fileObject(files, access, row, field, value, expires)
    }
    return shown
  }))
}
