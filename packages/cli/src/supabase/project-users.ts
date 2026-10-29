import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { writeAuthMigration } from '../auth/write-migration'
import { loadProjectAuth } from '../users/load-auth'
import { planAuthConfig, sharedUsersConfig, sharedUsersSchema } from './auth-config'
import { writeMigration } from './migration-files'
import { sharedUsersMigration } from './shared-users-migration'
import { authStoreMigrations } from './store-migrations'

/**
 * Signs the project in `projectDir`, made on a Supabase database, in on Supabase's own users, changing nothing in
 * Supabase's `auth` schema: points its Better Auth setup at a view over auth.users in a schema of its own, removes the
 * migrations of Protobase's own user table, and writes, in `db/migrations`, Better Auth's tables in that schema, then
 * the view, its side table and trigger, and the users' accounts with their Supabase passwords and social providers. It
 * only reads the database, which the project's auth keeps a connection pool open on, so the process must end itself.
 */
export const useSupabaseUsers = async (projectDir: string, out: (text: string) => void) => {
  const migrationsDir = path.join(projectDir, 'db', 'migrations')
  const authConfig = await planAuthConfig(projectDir, sharedUsersConfig)
  const storeMigrations = await authStoreMigrations(migrationsDir)
  const relative = (to: string) => path.relative(projectDir, to)

  for (const store of storeMigrations) await rm(path.join(migrationsDir, store))
  await mkdir(migrationsDir, { recursive: true })
  await authConfig.write()
  if (storeMigrations.length > 0) out(`removed ${storeMigrations.length} migrations of Protobase's own user table: Supabase's users replace it\n`)
  out(`pointed ${relative(authConfig.file)} at ${sharedUsersSchema}.users, a view over auth.users\n`)

  const authFile = await writeAuthMigration({ auth: await loadProjectAuth(projectDir), dir: migrationsDir, name: 'auth', writer: 'create protobase' })
  if (authFile) out(`wrote ${relative(authFile)}, Better Auth's tables in ${sharedUsersSchema}, pointing at auth.users\n`)
  const usersFile = await writeMigration(migrationsDir, 'supabase_users', sharedUsersMigration())
  out(`wrote ${relative(path.join(migrationsDir, usersFile))}, the view over auth.users and the users' accounts with their Supabase passwords and social providers\n`)
}
