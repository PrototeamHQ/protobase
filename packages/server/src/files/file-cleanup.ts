import type { Db } from '@protobase/query'
import type { ResourceSource } from '../resource-source'
import type { FilesOptions } from './options'
import { cleanupFiles, createFilesRuntime } from './runtime'

export type FileCleanupInput = { resources: ResourceSource[]; db: Db; files?: FilesOptions }

/**
 * The scheduled deletes of a project's files, for a runner outside a request: `protobase files cleanup`, or an interval
 * in `protobase serve`. `undefined` when the project has no file fields.
 */
export const createFileCleanup = ({ resources, db, files }: FileCleanupInput) => {
  const runtime = createFilesRuntime({ ...(files && { options: files }), env: globalThis.process?.env ?? {}, models: resources.map((source) => source.toModel()), systemPath: '' })
  return runtime && { run: (now?: Date) => cleanupFiles(runtime, db, now) }
}
