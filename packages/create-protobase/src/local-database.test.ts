import { describe, expect, it } from 'vitest'
import { composeFile } from './local-database'

describe('composeFile', () => {
  it('runs Postgres 18 with the role, password and database of the URL on its port', () => {
    const file = composeFile(new URL('postgres://protobase:pass%40word@localhost:55433/erp'))
    expect(file).toContain('image: postgres:18')
    expect(file).toContain("- '55433:5432'")
    expect(file).toContain('POSTGRES_USER: protobase\n')
    expect(file).toContain('POSTGRES_PASSWORD: pass@word\n')
    expect(file).toContain('POSTGRES_DB: erp\n')
    expect(file).toContain("pg_isready -U protobase -d erp'")
  })
})
