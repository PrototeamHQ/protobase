import { checkAuthSchema } from '@protobase/server'
import { createUserCommand } from '../users/commands'
import { readHidden } from '../users/password'
import { usersApi } from '../users/users-api'
import { bundleConfigFile } from '../worker/start-worker'
import { checkBundleManifest } from './bundle-manifest'
import { loadBundle } from './load-bundle'
import type { CreateAdminOptions } from './runtime-program'

// The runtime's `create-admin`: an admin of the bundle's app, made on a migrated auth schema with the app's settings.
export const createAdminInBundle = async (bundle: string, email: string, options: CreateAdminOptions, out: (text: string) => void) => {
  const file = await bundleConfigFile(bundle)
  checkBundleManifest(file)
  const project = await loadBundle(file)
  if (!project.auth) throw new Error('The bundle exports no `auth`: users are managed by Better Auth')
  await checkAuthSchema(project.auth)
  await createUserCommand(usersApi(project.auth), { email, role: 'admin', ...options }, { stdin: process.stdin, prompt: readHidden }, out)
}
