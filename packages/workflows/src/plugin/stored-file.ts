import type { StoredFile } from './context'

/** A stored file as JSON Schema, as the storage steps give and take it, and as `{ "x-file": true }` stands for. */
export const storedFileSchema = {
  type: 'object',
  required: ['configuration', 'path', 'name', 'type', 'size'],
  description: 'a stored file, { configuration, node?, path, name, type, size }, as a storage step or the http step gave it',
  properties: { configuration: { type: 'string' }, node: { type: 'string' }, path: { type: 'string' }, name: { type: 'string' }, type: { type: 'string' }, size: { type: 'integer' } },
}

/** Whether a value has a stored file's shape: its configuration, path, name, type and size, and a text node if any. */
export const isStoredFile = (value: unknown): value is StoredFile => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const { configuration, node, path, name, type, size } = value as Partial<Record<keyof StoredFile, unknown>>
  return typeof configuration === 'string' && typeof path === 'string' && typeof name === 'string' && typeof type === 'string' && typeof size === 'number' && (node === undefined || typeof node === 'string')
}
