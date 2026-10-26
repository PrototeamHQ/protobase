import { describe, expect, it } from 'vitest'
import { databaseUrl, envFile, withDatabasePort } from './env-file'

const example = [
  '# The app settings',
  'DATABASE_URL=postgres://protobase:protobase@localhost:55432/real_estate',
  'BETTER_AUTH_URL=http://localhost:5173',
  'BETTER_AUTH_SECRET=change-me-generate-with-openssl-rand-base64-32',
  '',
].join('\n')

describe('databaseUrl', () => {
  it('reads DATABASE_URL', () => {
    expect(databaseUrl(example).pathname).toBe('/real_estate')
  })

  it('refuses a file without it', () => {
    expect(() => databaseUrl('BETTER_AUTH_SECRET=x\n')).toThrow('.env.example has no DATABASE_URL')
  })
})

describe('withDatabasePort', () => {
  it('moves DATABASE_URL to the port and keeps every other line', () => {
    const moved = withDatabasePort(example, 55440).split('\n')
    expect(moved[1]).toBe('DATABASE_URL=postgres://protobase:protobase@localhost:55440/real_estate')
    expect(moved.filter((_, i) => i !== 1)).toEqual(example.split('\n').filter((_, i) => i !== 1))
  })
})

describe('envFile', () => {
  it('sets BETTER_AUTH_SECRET and keeps the rest', () => {
    expect(envFile(example, 'abc=')).toBe(example.replace('change-me-generate-with-openssl-rand-base64-32', 'abc='))
  })

  it('refuses a file without BETTER_AUTH_SECRET', () => {
    expect(() => envFile('DATABASE_URL=postgres://x@y/z\n', 'abc')).toThrow('.env.example has no BETTER_AUTH_SECRET')
  })
})
