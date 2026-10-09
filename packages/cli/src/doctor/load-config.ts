import path from 'node:path'
import type { ResourceModel } from '@protobase/schema'
import { importProjectFile } from '../project/import-project-file'

type ResourceLike = { toModel: () => ResourceModel; ignoredColumns: () => string[] }

const isResource = (value: unknown): value is ResourceLike =>
  typeof value === 'object' &&
  value !== null &&
  'toModel' in value &&
  'ignoredColumns' in value &&
  typeof value.toModel === 'function'

// Imports config/index.ts and collects every exported resource; views and other exports are skipped.
export const loadResourceModels = async (configDir: string) => {
  const exports = await importProjectFile(path.resolve(configDir, 'index.ts'))
  return Object.values(exports).filter(isResource).map((resource) => resource.toModel())
}
