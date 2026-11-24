import pg from 'pg'
import { checkMigrationRecord } from '@protobase/server'
import { projectAuth } from '../config/build-project'
import { openAppDatabase } from '../project/pg-db'
import { createUserCommand } from '../users/commands'
import { protobaseVersion } from '../version/version'
import { readHidden } from '../users/password'
import { usersApi } from '../users/users-api'
import { bundleConfigFile } from '../worker/start-worker'
import { checkBundleManifest } from './bundle-manifest'
import { loadBundle } from './load-bundle'
import type { CreateAdminOptions } from './runtime-program'

// The runtime's `create-admin`: an admin of the bundle's app, made on a database the app would start on (`checkMigrationRecord`) with the app's settings.
export const createAdminInBundle = async (bundle: string, email: string, options: CreateAdminOptions, out: (text: string) => void) => {
  const file = await bundleConfigFile(bundle)
  checkBundleManifest(file)
  const config = await loadBundle(file)
  if (!config.auth) throw new Error('Sign-in is off in the bundle\'s config (`auth: false`), so the app has no users to manage')
  if (!process.env.DATABASE_URL) throw new Error('No database: set DATABASE_URL')
  const auth = (await projectAuth(config, openAppDatabase(pg, process.env.DATABASE_URL)))!
  await checkMigrationRecord(auth, protobaseVersion)
  await createUserCommand(usersApi(auth), { email, role: 'admin', ...options }, { stdin: process.stdin, prompt: readHidden }, out)
}
