import { existsSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadNearestEnvFile } from '../dev/env'
import type { AdminAuth } from '@protobase/server'

// Imports the project's protobase.config.ts directly (the CLI runs under tsx) and returns its Better Auth instance.
export const loadProjectAuth = async (projectDir: string) => {
  loadNearestEnvFile(projectDir)
  const file = path.join(projectDir, 'protobase.config.ts')
  if (!existsSync(file)) throw new Error(`No protobase.config.ts in ${projectDir}; run this inside a project`)
  const module: { default?: { auth?: AdminAuth } } = await import(pathToFileURL(file).href)
  const auth = module.default?.auth
  if (!auth) throw new Error('protobase.config.ts does not export `auth`; users are managed by Better Auth')
  return auth
}
