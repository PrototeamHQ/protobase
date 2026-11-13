import { describe, expect, it } from 'vitest'
import { readSettings } from './settings'

const env = { POSTGRES_USER: 'protobase', POSTGRES_PASSWORD: 'secret', POSTGRES_DB: 'protobase', POSTGRES_PORT: '55432' }

describe('readSettings', () => {
  it('reads the settings docker-compose.yml reads, with its default pooler port', () => {
    expect(readSettings(env)).toEqual({ user: 'protobase', password: 'secret', database: 'protobase', port: 55432, poolerPort: 55442, bin: undefined })
  })

  it('takes the folder of the Postgres executables', () => {
    expect(readSettings({ ...env, POSTGRES_BIN: '/opt/postgres/bin' }).bin).toBe('/opt/postgres/bin')
  })

  it('fails on a missing setting, naming it', () => {
    expect(() => readSettings({ ...env, POSTGRES_PORT: '' })).toThrow('POSTGRES_PORT is not set in .env')
  })
})
