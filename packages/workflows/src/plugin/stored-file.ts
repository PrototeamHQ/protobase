import type { StoredFile } from './context'

/** Whether a value has a stored file's shape: its configuration, path, name, type and size, and a text node if any. */
export const isStoredFile = (value: unknown): value is StoredFile => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const { configuration, node, path, name, type, size } = value as Partial<Record<keyof StoredFile, unknown>>
  return typeof configuration === 'string' && typeof path === 'string' && typeof name === 'string' && typeof type === 'string' && typeof size === 'number' && (node === undefined || typeof node === 'string')
}
