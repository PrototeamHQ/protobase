import { existsSync } from 'node:fs'
import path from 'node:path'
import postgres from 'postgres'
import { applyMigrations } from './apply-migrations'

export const migrationsDir = 'db/migrations'

/**
 * The CLI's `migrate`: applies the project's db/migrations to the database, as the runtime's `migrate` applies a
 * bundle's (see applyMigrations). It runs none of the project's code, so it needs no package.json or install. The
 * connection is asked for only when there is something to apply.
 */
export const migrateProject = async (projectDir: string, connectionUrl: () => string, out: (text: string) => void) => {
  const dir = path.join(projectDir, migrationsDir)
  if (!existsSync(dir)) {
    out(`the project has no ${migrationsDir}\n`)
    return
  }
  // Its own connection: the pool of db/connect.ts opens read-only sessions.
  const sql = postgres(connectionUrl(), { max: 1, onnotice: () => {} })
  try {
    await applyMigrations(sql, dir, out)
  } finally {
    await sql.end()
  }
}
