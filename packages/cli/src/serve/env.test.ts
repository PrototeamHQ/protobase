import { describe, expect, it } from 'vitest'
import { defaultPort, readServeEnv } from './env'

describe('readServeEnv', () => {
  it('reads the variables the platform passes', () => {
    expect(readServeEnv({ PORT: '3000', DATABASE_URL: 'postgres://db/app', REQUEST_LOG: '1', PROTOBASE_FILES_CLEANUP_MINUTES: '0' })).toEqual({
      port: 3000,
      databaseUrl: 'postgres://db/app',
      requestLog: true,
      filesCleanupMinutes: 0,
    })
  })

  it('defaults the port and leaves the database and request log out', () => {
    expect(readServeEnv({})).toEqual({ port: defaultPort, databaseUrl: undefined, requestLog: false, filesCleanupMinutes: 60 })
  })

  it('refuses a PORT that is not a port number', () => {
    expect(() => readServeEnv({ PORT: 'http' })).toThrow('PORT must be a port number, not "http"')
    expect(() => readServeEnv({ PORT: '70000' })).toThrow('PORT must be a port number')
    expect(() => readServeEnv({ PROTOBASE_FILES_CLEANUP_MINUTES: 'hourly' })).toThrow('PROTOBASE_FILES_CLEANUP_MINUTES must be a whole number of minutes, not "hourly"')
  })
})
