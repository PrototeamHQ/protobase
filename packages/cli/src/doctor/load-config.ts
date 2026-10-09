import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { ResourceModel } from '@protobase/schema'

type ResourceLike = { toModel: () => ResourceModel; ignoredColumns: () => string[] }

const isResource = (value: unknown): value is ResourceLike =>
  typeof value === 'object' &&
  value !== null &&
  'toModel' in value &&
  'ignoredColumns' in value &&
  typeof value.toModel === 'function'

// Imports config/index.ts and collects every exported resource; views and other exports are skipped.
export const loadResourceModels = async (configDir: string) => {
  const entry = pathToFileURL(path.resolve(configDir, 'index.ts')).href
  const exports: Record<string, unknown> = await import(entry)
  return Object.values(exports).filter(isResource).map((resource) => resource.toModel())
}
