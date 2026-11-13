import { createHash } from 'node:crypto'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { databaseUrl, matchesIntegrity, postgresIn } from './postgres'

describe('postgres', () => {
  it('keeps the binaries and the data in the home folder', () => {
    const pg = postgresIn('/home', 'p@ss', 55432)
    expect(pg.data).toBe(path.join('/home', 'data', 'postgres'))
    expect(pg.bin.startsWith(path.join('/home', 'postgres-'))).toBe(true)
  })

  it('connects over 127.0.0.1 with the password escaped', () => {
    expect(databaseUrl(postgresIn('/home', 'p@ss/', 55432))).toBe('postgres://protobase:p%40ss%2F@127.0.0.1:55432/postgres')
  })

  it('checks a download against its npm integrity', () => {
    const bytes = new TextEncoder().encode('tarball')
    const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`
    expect(matchesIntegrity(bytes, integrity)).toBe(true)
    expect(matchesIntegrity(new TextEncoder().encode('other'), integrity)).toBe(false)
  })
})
