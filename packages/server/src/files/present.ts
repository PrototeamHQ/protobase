import type { FieldModel } from '@protobase/schema'
import { encodeKey } from '@protobase/schema/internal'
import type { RequestAccess } from '../request-access'
import type { Row } from '../types'
import { downloadExpiry, signedDownloadUrl } from './download-url'
import { externalFile, parseExternalUrl } from './external-url'
import { octetStream } from './media-types'
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

// The value the row holds in one of the field's own readable fields, such as its type field.
const ownFieldOf = (access: RequestAccess, row: Row, target: string | undefined) => (target !== undefined && access.model.fields[target] ? row[target] : undefined)

// The ThumbHash the row holds for the field's image, when its placeholder field is readable.
const placeholderOf = (access: RequestAccess, row: Row, field: FieldModel) => {
  const placeholder = ownFieldOf(access, row, field.file?.placeholder)
  return typeof placeholder === 'string' ? placeholder : undefined
}

// The media type the row's type field holds, when readable and set: it wins over the one the path or URL names.
const typeOf = (access: RequestAccess, row: Row, field: FieldModel) => {
  const type = ownFieldOf(access, row, field.file?.typeField)
  return typeof type === 'string' && type !== '' ? type : undefined
}

// The size the row's size field holds, when readable and set; a bigint field holds it as text.
const sizeOf = (access: RequestAccess, row: Row, field: FieldModel) => {
  const size = ownFieldOf(access, row, field.file?.sizeField)
  const bytes = typeof size === 'string' ? Number(size) : size
  return typeof bytes === 'number' && Number.isSafeInteger(bytes) && bytes >= 0 ? bytes : undefined
}

// A URL of a field with `.externalUrls()`: linked as it is, with no variants, and a size only when its size field holds one.
const externalObject = (files: FilesRuntime, access: RequestAccess, row: Row, field: FieldModel, value: string, url: URL): FileObject => {
  const { name, type } = externalFile(url, files.types)
  const placeholder = placeholderOf(access, row, field)
  const size = sizeOf(access, row, field)
  return { uri: value, name, type: typeOf(access, row, field) ?? type ?? octetStream, ...(size !== undefined && { size }), url: value, ...(placeholder !== undefined && { placeholder }) }
}

const fileObject = async (files: FilesRuntime, access: RequestAccess, row: Row, field: FieldModel, value: string, expires: number): Promise<FileObject> => {
  const external = field.file?.external ? parseExternalUrl(value) : undefined
  if (external) return externalObject(files, access, row, field, value, external)
  const ref = parseUri(value)
  if (!ref || !files.providers[ref.provider]) return { uri: value, missing: true }
  const placeholder = placeholderOf(access, row, field)
  const size = sizeOf(access, row, field) ?? ref.size
  const type = typeOf(access, row, field) ?? files.types.servedType(ref.path)
  const described = { uri: value, name: ref.name, type, ...(size !== undefined && { size }), ...(placeholder !== undefined && { placeholder }) }
  const link = await linker(files, access, row, field.name, ref, expires)
  if (!link) return described
  const variants: Record<string, FileVariantObject> = {}
  for (const [name, path] of Object.entries(variantPaths(ref))) {
    const box = field.file?.variants?.[name]
    variants[name] = { url: await link(path), type: files.types.servedType(path), ...(box?.width !== undefined && { width: box.width }), ...(box?.height !== undefined && { height: box.height }) }
  }
  return { ...described, url: await link(ref.path), ...(Object.keys(variants).length > 0 && { variants }) }
}

/**
 * Records as responses carry them: each readable file field as `{ uri, name, type, size, url }`, with its `variants` and
 * `placeholder` when it has them. The type and size come from the field's type and size fields when the row holds them,
 * else from the stored value. The URLs are minted here, after the ETag, for a caller who may already see the row:
 * private files get a signed link to this row's field, public ones their permanent address, and an external URL of a
 * field with `.externalUrls()` is its own `url`. Stored values, hooks and
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
