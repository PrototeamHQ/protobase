import { existsSync } from 'node:fs'
import path from 'node:path'
import type { FilesOptions } from '@protobase/server'
import { importProjectFile } from '../project/import-project-file'

/** `files` of the project's protobase.config.ts, or none when it has no such file or no `files`. */
export const projectFilesOptions = async (projectDir: string): Promise<FilesOptions> => {
  const file = path.join(projectDir, 'protobase.config.ts')
  if (!existsSync(file)) return {}
  const module = (await importProjectFile(file)) as { default?: { files?: FilesOptions } }
  return module.default?.files ?? {}
}
