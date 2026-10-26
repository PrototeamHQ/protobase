import type { FilesOptions } from '@protobase/server'
import { projectFiles } from '../config/project-parts'
import { loadSourceConfig } from '../config/source-config'

/** The files options of the project in `projectDir`, its providers made; none when its config has no `files`. */
export const projectFilesOptions = async (projectDir: string): Promise<FilesOptions> =>
  (await projectFiles(await loadSourceConfig(projectDir, { command: 'tool' }))) ?? {}
