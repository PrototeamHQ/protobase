import { existsSync } from 'node:fs'
import path from 'node:path'
import { mergeConfig, type ProjectConfig } from '@protobase/server'
import { loadNearestEnvFile } from '../dev/env'
import type { Extension } from '../project/extensions'
import { importProjectFile } from '../project/import-project-file'
import { noMobileSection } from './mobile-config'

const configOf = async (file: string): Promise<ProjectConfig> => ((await importProjectFile(file)).default ?? {}) as ProjectConfig

/**
 * What a mobile build needs of the project in `dir`, merged as `protobase dev` merges it after the configs of
 * `extensions`: its mobile section, unchecked, and its auth. The project's .env is loaded first, as other commands do.
 */
export const loadMobileProject = async (dir: string, extensions: Extension[]) => {
  loadNearestEnvFile(dir)
  const file = path.join(dir, 'protobase.config.ts')
  if (!existsSync(file)) throw new Error(noMobileSection)
  const extended = await Promise.all(extensions.flatMap((extension) => (extension.config ? [configOf(extension.config)] : [])))
  const { mobile, auth } = mergeConfig(...extended, await configOf(file))
  return { mobile: mobile as unknown, auth }
}
