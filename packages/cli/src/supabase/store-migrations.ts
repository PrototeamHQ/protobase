import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { authMigrationTitle } from '../auth/migration-file'

// A new project's migrations make Protobase's own user table, `auth.user`, and the tables pointing at it. An import
// makes Supabase's auth.users the user table instead, with Better Auth's other tables planned next to it once its
// rows are loaded, so those migrations go, before any of them is applied.

/** The migrations in `dir` that `protobase auth migration` or `protobase migration` wrote for the auth schema. */
export const authStoreMigrations = async (dir: string) => {
  if (!existsSync(dir)) return []
  const files = (await readdir(dir)).filter((file) => file.endsWith('.sql')).sort()
  const found: string[] = []
  for (const file of files) if ((await readFile(path.join(dir, file), 'utf8')).startsWith(`-- ${authMigrationTitle}, written by `)) found.push(file)
  return found
}
