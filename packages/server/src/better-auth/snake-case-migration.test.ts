import { readdir, readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { snakeCaseMigration } from './snake-case-migration'

const examples = new URL('../../../../examples/', import.meta.url)

describe('snakeCaseMigration', () => {
  it('names the tables in the given schema, or the current one without', () => {
    expect(snakeCaseMigration('auth')).toContain(`table_schema = 'auth'`)
    expect(snakeCaseMigration('auth')).toContain('alter table "auth"."twoFactor" rename to two_factor;')
    expect(snakeCaseMigration()).toContain('table_schema = current_schema()')
    expect(snakeCaseMigration()).toContain('alter table "twoFactor" rename to two_factor;')
  })

  it('refuses a schema name it would have to quote', () => {
    expect(() => snakeCaseMigration(`auth"; drop table "user`)).toThrow(/Invalid auth schema name/)
  })

  it('is the migration every example carries', async () => {
    const examplesWithAuth = ['erp', 'real-estate', 'scratch']
    for (const example of examplesWithAuth) {
      const migrations = new URL(`${example}/db/migrations/`, examples)
      const [file] = (await readdir(migrations)).filter((name) => name.endsWith('_auth_snake_case.sql'))
      expect(await readFile(new URL(file!, migrations), 'utf8')).toContain(`\n\n${snakeCaseMigration('auth')}\n`)
    }
  })
})
