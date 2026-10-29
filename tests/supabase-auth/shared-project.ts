import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { bin, root, run } from '../../packages/cli/tests/support/auth-project'
import { useSupabaseUsers } from '../../packages/cli/src/supabase/project-users'
import { loadProjectAuth } from '../../packages/cli/src/users/load-auth'

// A project as `npm create protobase <url>` writes it on a Supabase database: the scratch preset's files that git
// tracks, with the URL in .env, then the wizard's Supabase step. It lives under tests/supabase-auth/runs/, inside the
// repository, so it resolves its packages from the workspace's, as an installed project does from its node_modules.
export const createSharedProject = async (databaseUrl: string) => {
  const projectDir = path.join(root, 'tests/supabase-auth/runs', `project-${randomBytes(4).toString('hex')}`)
  const scratch = path.join(root, 'tests/apps/scratch')
  for (const file of execFileSync('git', ['ls-files', '-z'], { cwd: scratch, encoding: 'utf8' }).split('\0').filter(Boolean)) {
    await mkdir(path.dirname(path.join(projectDir, file)), { recursive: true })
    await cp(path.join(scratch, file), path.join(projectDir, file))
  }
  const settings = { DATABASE_URL: databaseUrl, PROTOBASE_URL: 'http://localhost:5173', PROTOBASE_SECRET: randomBytes(32).toString('base64') }
  await writeFile(path.join(projectDir, '.env'), Object.entries(settings).map(([name, value]) => `${name}=${value}\n`).join(''))
  Object.assign(process.env, settings)

  const printed: string[] = []
  await useSupabaseUsers(projectDir, (text) => void printed.push(text))
  const migrationsDir = path.join(projectDir, 'db/migrations')
  const migrations = Object.fromEntries(await Promise.all((await readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).map(async (file) => [file, await readFile(path.join(migrationsDir, file), 'utf8')] as const)))

  /** `bun run db:migrate`: the project's db/migrate.ts, as the role DATABASE_URL names. */
  const migrate = () => run([bin, 'run', 'db/migrate.ts'], projectDir, settings)
  const auth = () => loadProjectAuth(projectDir)
  const dispose = () => rm(projectDir, { recursive: true, force: true })
  return { projectDir, printed, migrations, config: () => readFile(path.join(projectDir, 'protobase.config.ts'), 'utf8'), migrate, auth, dispose }
}
