import { describe, expect, it } from 'vitest'
import { ddlText } from '../ddl'
import { keepStatements, keptTables, revivalCheckSql } from './module-switches'
import { settingsStoreNames } from './settings-names'

const names = settingsStoreNames({ personalAccessTokens: { prefix: 'app_' } })

describe('a module kept while off', () => {
  it('takes not null from the columns it adds to the tables of the modules on, the user table left alone when another system made it', () => {
    expect(keepStatements(names, 'organizations', names.names.modules).map(ddlText)).toEqual([
      'alter table "auth"."user" alter column "last_organization_id" drop not null',
      'alter table "auth"."session" alter column "active_organization_id" drop not null',
      'alter table "auth"."personal_access_token" alter column "organization_id" drop not null',
    ])
    expect(keepStatements(names, 'organizations', names.names.modules, true).map(ddlText)).not.toContain('alter table "auth"."user" alter column "last_organization_id" drop not null')
    expect(keepStatements(settingsStoreNames({}), 'organizations', names.names.modules).map(ddlText)).not.toContain('alter table "auth"."personal_access_token" alter column "organization_id" drop not null')
  })

  it('leaves alone the tables of a module turned on in the same migration, which are made without the column', () => {
    const before = names.names.modules.filter((module) => module !== 'personal_access_tokens')
    expect(keepStatements(names, 'organizations', before).map(ddlText)).not.toContain('alter table "auth"."personal_access_token" alter column "organization_id" drop not null')
  })

  it('counts the rows of the tables its steps up to the kept one made, once on again, unless forced', () => {
    expect(keptTables(names, 'mail_senders', 1).map(({ name }) => name)).toEqual(['mail_sender'])
    expect(keptTables(names, 'mail_senders', 5).map(({ name }) => name)).toEqual(['mail_sender', 'mail_sender_verification'])
    const check = revivalCheckSql(names, 'personal_access_tokens', 1)
    expect(check).toContain(`if coalesce(current_setting('protobase.force', true), '') <> 'true' then`)
    expect(check).toContain("raise exception '%', format('The personal_access_tokens module was kept while off, and its tables still hold rows: %s.")
  })
})
