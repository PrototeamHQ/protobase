import { existsSync } from 'node:fs'
import path from 'node:path'
import { loadNearestEnvFile } from '../dev/env'
import { importProjectFile } from '../project/import-project-file'
import type { AdminAuth } from '@protobase/server'

// Imports the project's protobase.config.ts directly and returns its Better Auth instance.
export const loadProjectAuth = async (projectDir: string) => {
  loadNearestEnvFile(projectDir)
  const file = path.join(projectDir, 'protobase.config.ts')
  if (!existsSync(file)) throw new Error(`No protobase.config.ts in ${projectDir}; run this inside a project`)
  const module = (await importProjectFile(file)) as { default?: { auth?: AdminAuth } }
  const auth = module.default?.auth
  if (!auth) throw new Error('protobase.config.ts does not export `auth`; users are managed by Better Auth')
  return auth
}
