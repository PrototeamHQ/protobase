import { describe, expect, it } from 'vitest'
import { databaseUrl, envFile, withDatabasePort, withDatabaseUrl, withoutPassword } from './env-file'

const example = [
  '# The app settings',
  'DATABASE_URL=postgres://protobase:protobase@localhost:55432/real_estate',
  'PROTOBASE_URL=http://localhost:5173',
  'PROTOBASE_SECRET=change-me-generate-with-openssl-rand-base64-32',
  '',
].join('\n')

describe('databaseUrl', () => {
  it('reads DATABASE_URL', () => {
    expect(databaseUrl(example).pathname).toBe('/real_estate')
  })

  it('refuses a file without it', () => {
    expect(() => databaseUrl('PROTOBASE_SECRET=x\n')).toThrow('.env.example has no DATABASE_URL')
  })
})

describe('withDatabasePort', () => {
  it('moves DATABASE_URL to the port and keeps every other line', () => {
    const moved = withDatabasePort(example, 55440).split('\n')
    expect(moved[1]).toBe('DATABASE_URL=postgres://protobase:protobase@localhost:55440/real_estate')
    expect(moved.filter((_, i) => i !== 1)).toEqual(example.split('\n').filter((_, i) => i !== 1))
  })
})

describe('withDatabaseUrl', () => {
  it('sets DATABASE_URL and keeps every other line', () => {
    const moved = withDatabaseUrl(example, 'postgres://shop@db.example.com:5432/shop').split('\n')
    expect(moved[1]).toBe('DATABASE_URL=postgres://shop@db.example.com:5432/shop')
    expect(moved.filter((_, i) => i !== 1)).toEqual(example.split('\n').filter((_, i) => i !== 1))
  })
})

describe('withoutPassword', () => {
  it('drops the password and keeps the rest of the URL', () => {
    expect(withoutPassword('postgres://shop:s%40cret@db.example.com:5432/shop?sslmode=require')).toBe('postgres://shop@db.example.com:5432/shop?sslmode=require')
    expect(withoutPassword('postgres://localhost/shop')).toBe('postgres://localhost/shop')
  })
})

describe('envFile', () => {
  it('sets PROTOBASE_SECRET and keeps the rest', () => {
    expect(envFile(example, 'abc=')).toBe(example.replace('change-me-generate-with-openssl-rand-base64-32', 'abc='))
  })

  it('refuses a file without PROTOBASE_SECRET', () => {
    expect(() => envFile('DATABASE_URL=postgres://x@y/z\n', 'abc')).toThrow('.env.example has no PROTOBASE_SECRET')
  })
})
