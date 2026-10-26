import { existsSync } from 'node:fs'
import path from 'node:path'
import { Kysely, PostgresDialect } from 'kysely'
import pg from 'pg'
import type { ProtobaseConfig } from '@protobase/config'
import type { AuthHooks, JobRun, Mailer } from '@protobase/server'
import { buildAppAuth, buildAuthenticator, declaredJob } from '@protobase/server/internal'

const exampleDir = (name: string) => path.join(import.meta.dirname, '../../examples', name)

const configOf = async (name: string) => ((await import(path.join(exampleDir(name), 'protobase.config.ts'))) as { default: ProtobaseConfig }).default

/**
 * An example's sign-in and authenticator as its protobase.config.ts describes them, with its auth/hooks.ts, built on a
 * pool of their own on `databaseUrl`: the app's `secret`, its `url` (default `http://localhost:5173`) and a `mailer`
 * given here; `close` ends the pool.
 */
export const exampleAuth = async (name: string, databaseUrl: string, { secret, url = 'http://localhost:5173', mailer }: { secret: string; url?: string; mailer?: Mailer }) => {
  const config = await configOf(name)
  const hooksFile = path.join(exampleDir(name), 'auth/hooks.ts')
  const hooks = existsSync(hooksFile) ? ((await import(hooksFile)) as AuthHooks) : undefined
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 })
  const settings = config.auth === false ? {} : (config.auth ?? {})
  const auth = await buildAppAuth({ ...settings, baseURL: url, secret }, { pool, db: new Kysely<any>({ dialect: new PostgresDialect({ pool }) }), ...(hooks && { hooks }), ...(mailer && { mailer }) })
  return { auth, authenticate: buildAuthenticator(config.authenticate, auth), close: () => pool.end() }
}

/** An example's jobs as its protobase.config.ts declares them, each run from its jobs/<name>.ts. */
export const exampleJobs = async (name: string) =>
  Object.entries((await configOf(name)).jobs ?? {}).map(([job, declaration]) => declaredJob(job, declaration, async () => (await import(path.join(exampleDir(name), 'jobs', `${job}.ts`))).default as JobRun))
