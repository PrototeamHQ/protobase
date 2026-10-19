import { describe, expect, it } from 'vitest'
import { defaultPort, readServeEnv } from './env'

describe('readServeEnv', () => {
  it('reads the variables the platform passes', () => {
    expect(readServeEnv({ PORT: '3000', DATABASE_URL: 'postgres://db/app', REQUEST_LOG: 'true', PROTOBASE_FILES_CLEANUP_MINUTES: '0', PROTOBASE_JOBS: 'false', PROTOBASE_STARTUP_CHECKS: 'false', PROTOBASE_JOBS_DRAIN_TOKEN: 's3cret', PROTOBASE_DB_CONNECTIONS: '3' })).toEqual({
      port: 3000,
      databaseUrl: 'postgres://db/app',
      dbConnections: 3,
      requestLog: true,
      filesCleanupMinutes: 0,
      runJobs: false,
      startupChecks: false,
      drainToken: 's3cret',
    })
  })

  it('defaults the port and leaves the database and request log out', () => {
    expect(readServeEnv({})).toEqual({ port: defaultPort, databaseUrl: undefined, requestLog: false, filesCleanupMinutes: 60, runJobs: true, startupChecks: true })
  })

  it('refuses a PORT that is not a port number', () => {
    expect(() => readServeEnv({ PORT: 'http' })).toThrow('PORT must be a port number, not "http"')
    expect(() => readServeEnv({ PORT: '70000' })).toThrow('PORT must be a port number')
    expect(() => readServeEnv({ PROTOBASE_FILES_CLEANUP_MINUTES: 'hourly' })).toThrow('PROTOBASE_FILES_CLEANUP_MINUTES must be a whole number of minutes, not "hourly"')
    expect(() => readServeEnv({ PROTOBASE_DB_CONNECTIONS: '0' })).toThrow('PROTOBASE_DB_CONNECTIONS must be a whole number of connections, at least 1, not "0"')
    expect(() => readServeEnv({ PROTOBASE_JOBS: 'off' })).toThrow('PROTOBASE_JOBS must be true or false, not "off"')
    expect(() => readServeEnv({ PROTOBASE_STARTUP_CHECKS: 'on' })).toThrow('PROTOBASE_STARTUP_CHECKS must be true or false, not "on"')
    expect(() => readServeEnv({ REQUEST_LOG: '1' })).toThrow('REQUEST_LOG must be true or false, not "1"')
  })
})
