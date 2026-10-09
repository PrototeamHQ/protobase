import { describe, expect, it } from 'vitest'
import { defaultPort, readServeEnv } from './env'

describe('readServeEnv', () => {
  it('reads the variables the platform passes', () => {
    expect(readServeEnv({ PORT: '3000', DATABASE_URL: 'postgres://db/app', REQUEST_LOG: '1' })).toEqual({
      port: 3000,
      databaseUrl: 'postgres://db/app',
      requestLog: true,
    })
  })

  it('defaults the port and leaves the database and request log out', () => {
    expect(readServeEnv({})).toEqual({ port: defaultPort, databaseUrl: undefined, requestLog: false })
  })

  it('refuses a PORT that is not a port number', () => {
    expect(() => readServeEnv({ PORT: 'http' })).toThrow('PORT must be a port number, not "http"')
    expect(() => readServeEnv({ PORT: '70000' })).toThrow('PORT must be a port number')
  })
})
