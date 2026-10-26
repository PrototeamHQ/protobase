import type { KeyObject } from 'node:crypto'
import { readDbConnections, readSigningKey } from '@protobase/server'
import { readTrustedProxies } from './client-address'

// The environment the platform provides. The app's own settings (PROTOBASE_URL, PROTOBASE_SECRET, ...) are its config's.
export type ServeEnv = {
  port: number
  // DATABASE_URL.
  databaseUrl?: string
  // How many connections the pool opens to DATABASE_URL (PROTOBASE_DB_CONNECTIONS), such as the plan's limit, which the
  // app's Better Auth store shares; function calls and jobs hold one less. Unset, 10.
  dbConnections?: number
  // Whether every request is logged (REQUEST_LOG=true).
  requestLog: boolean
  // Minutes between runs of the scheduled file deletes; 0 leaves them to `protobase files cleanup` or the platform.
  filesCleanupMinutes: number
  // Whether this process runs the app's jobs (PROTOBASE_JOBS=false leaves them to `protobase worker`); it enqueues them either way.
  runJobs: boolean
  // Whether startup reads the auth, changes, webhooks and jobs schemas and the assistant's query role and refuses ones that are behind
  // (PROTOBASE_STARTUP_CHECKS=false skips them, for restarts of a bundle that already started on this database).
  startupChecks: boolean
  // The operator's bearer token for POST /api/jobs/drain (PROTOBASE_JOBS_DRAIN_TOKEN); without it there is no drain endpoint.
  drainToken?: string
  // The proxies whose X-Forwarded-For names the client (PROTOBASE_TRUSTED_PROXIES); without them the socket's peer is the client.
  trustedProxies: string[]
  // The key that signs every file of the mobile release (PROTOBASE_MOBILE_SIGNING_KEY), for an app whose updater checks signatures.
  mobileSigningKey?: KeyObject
}

export const defaultPort = 8787

// A boolean variable is true or false; unset or empty, it takes its default.
const readBoolean = (env: Record<string, string | undefined>, name: string, fallback: boolean) => {
  const value = env[name]
  if (!value) return fallback
  if (value !== 'true' && value !== 'false') throw new Error(`${name} must be true or false, not "${value}"`)
  return value === 'true'
}

export const readServeEnv = (env: Record<string, string | undefined>): ServeEnv => {
  const port = env.PORT ? Number(env.PORT) : defaultPort
  if (!Number.isInteger(port) || port < 0 || port > 65_535) throw new Error(`PORT must be a port number, not "${env.PORT}"`)
  const minutes = env.PROTOBASE_FILES_CLEANUP_MINUTES ? Number(env.PROTOBASE_FILES_CLEANUP_MINUTES) : 60
  if (!Number.isInteger(minutes) || minutes < 0) throw new Error(`PROTOBASE_FILES_CLEANUP_MINUTES must be a whole number of minutes, not "${env.PROTOBASE_FILES_CLEANUP_MINUTES}"`)
  const mobileSigningKey = readSigningKey(env)
  const connections = env.PROTOBASE_DB_CONNECTIONS ? readDbConnections(env) : undefined
  return {
    port,
    databaseUrl: env.DATABASE_URL || undefined,
    ...(connections && { dbConnections: connections }),
    requestLog: readBoolean(env, 'REQUEST_LOG', false),
    filesCleanupMinutes: minutes,
    runJobs: readBoolean(env, 'PROTOBASE_JOBS', true),
    startupChecks: readBoolean(env, 'PROTOBASE_STARTUP_CHECKS', true),
    ...(env.PROTOBASE_JOBS_DRAIN_TOKEN && { drainToken: env.PROTOBASE_JOBS_DRAIN_TOKEN }),
    trustedProxies: readTrustedProxies(env.PROTOBASE_TRUSTED_PROXIES),
    ...(mobileSigningKey && { mobileSigningKey }),
  }
}
