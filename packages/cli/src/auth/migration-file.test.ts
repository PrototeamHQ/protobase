import { describe, expect, it } from 'vitest'
import { migrationText, nextMigrationName } from './migration-file'

describe('nextMigrationName', () => {
  it('numbers one past the highest migration, as wide as the others', () => {
    expect(nextMigrationName(['001_core.sql', '008_calculated_totals.sql', '002_crm.sql'], 'auth')).toBe('009_auth.sql')
    expect(nextMigrationName(['0099_big.sql'], 'auth')).toBe('0100_auth.sql')
    expect(nextMigrationName(['.gitkeep', 'README.md', 'notes_1.sql'], 'auth')).toBe('001_auth.sql')
    expect(nextMigrationName([], 'auth_passkeys')).toBe('001_auth_passkeys.sql')
  })

  it('refuses a name that is not a plain file name', () => {
    expect(() => nextMigrationName([], '../auth')).toThrow(/Invalid migration name/)
    expect(() => nextMigrationName([], 'Auth Changes')).toThrow(/Invalid migration name/)
  })
})

describe('migrationText', () => {
  it('says where the statements come from', () => {
    expect(migrationText('create table "a" ("id" text);')).toBe(
      "-- The auth schema changes this version of Protobase needs, written by `protobase auth migration`.\n-- Applied with the project's other migrations; edit or remove statements the project handles differently.\n\ncreate table \"a\" (\"id\" text);\n",
    )
  })
})
