import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { writeAuthMigration } from '../auth/write-migration'
import { loadProjectAuth } from '../users/load-auth'
import { planAuthConfig } from './auth-config'
import { writeMigration } from './migration-files'
import { authStoreMigrations } from './store-migrations'
import { accountsMigration, usersColumnsMigration } from './users-migrations'

/**
 * Signs the project in `projectDir`, made on a Supabase database, in on Supabase's own auth.users, as `protobase import
 * supabase` does on its copy: points its Better Auth setup at auth.users, removes the migrations of Protobase's own user
 * table, and writes, in `db/migrations`, the columns Better Auth needs on auth.users, Better Auth's tables next to it
 * and the users' accounts with their Supabase passwords and social providers. It only reads the database, which the
 * project's auth keeps a connection pool open on, so the process must end itself.
 */
export const useSupabaseUsers = async (projectDir: string, out: (text: string) => void) => {
  const migrationsDir = path.join(projectDir, 'db', 'migrations')
  const authConfig = await planAuthConfig(projectDir)
  const storeMigrations = await authStoreMigrations(migrationsDir)
  const relative = (to: string) => path.relative(projectDir, to)

  for (const store of storeMigrations) await rm(path.join(migrationsDir, store))
  await mkdir(migrationsDir, { recursive: true })
  const usersFile = await writeMigration(migrationsDir, 'supabase_users', usersColumnsMigration())
  await authConfig.write()
  if (storeMigrations.length > 0) out(`removed ${storeMigrations.length} migrations of Protobase's own user table: auth.users replaces it\n`)
  out(`wrote ${relative(path.join(migrationsDir, usersFile))}, the columns Better Auth needs on auth.users, and pointed ${relative(authConfig.file)} at it\n`)

  const authFile = await writeAuthMigration({ auth: await loadProjectAuth(projectDir), dir: migrationsDir, name: 'auth' })
  if (authFile) out(`wrote ${relative(authFile)}, Better Auth's tables next to auth.users\n`)
  const accountsFile = await writeMigration(migrationsDir, 'supabase_accounts', accountsMigration())
  out(`wrote ${relative(path.join(migrationsDir, accountsFile))}, the users' accounts with their Supabase passwords and social providers\n`)
}
