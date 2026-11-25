import { describe, expect, it } from 'vitest'
import { ddlText } from '../ddl'
import type { ModuleDeclaration } from '../../names/declaration'
import { builtInModules, type ModuleId } from '../../names/modules'
import { allModules } from '../../names/modules-on'
import { resolveNames } from '../../names/resolve-names'
import { keepSql, keepStatements, keptTables, retiredColumns, revivalCheckSql, unwatchSql } from './module-switches'
import { settingsStoreNames } from './settings-names'

const names = settingsStoreNames({ personalAccessTokens: { prefix: 'app_' } })

describe('a module kept while off', () => {
  it('takes not null from the columns it adds to the tables of the modules on, the user table left alone when another system made it', () => {
    expect(keepStatements(names, 'organizations', names.names.modules).map(ddlText).filter((text) => text.includes('drop not null'))).toEqual([
      'alter table "auth"."user" alter column "last_organization_id" drop not null',
      'alter table "auth"."session" alter column "active_organization_id" drop not null',
    ])
    expect(keepStatements(names, 'organizations', names.names.modules, true).map(ddlText).filter((text) => text.includes('drop not null'))).toEqual(['alter table "auth"."session" alter column "active_organization_id" drop not null'])
  })

  it('watches the columns it retires for writes, by hour, and stops once it is on again', () => {
    const watch = keepStatements(names, 'organizations', names.names.modules).map(ddlText)
    expect(watch).toContain('create schema if not exists "retired"')
    expect(watch.filter((text) => text.startsWith('create trigger'))).toEqual([
      `create trigger "last_organization_id_retired_writes" after insert or update of "last_organization_id" on "auth"."user" for each row when (new."last_organization_id" is not null) execute function "retired"."count_write"('last_organization_id')`,
      `create trigger "active_organization_id_retired_writes" after insert or update of "active_organization_id" on "auth"."session" for each row when (new."active_organization_id" is not null) execute function "retired"."count_write"('active_organization_id')`,
    ])
    expect(unwatchSql(names, 'organizations', names.names.modules)).toContain('drop trigger if exists "last_organization_id_retired_writes" on "auth"."user";')
    expect(keepSql(names, 'mail_senders', names.names.modules)).toBe('-- mail_senders off: its tables and rows are kept as they are.')
    expect(unwatchSql(names, 'mail_senders', names.names.modules)).toBeUndefined()
  })

  // Retiring a column relaxes it and watches it; no column retires that must be made required again once its module is
  // on, which would need a check that no row was written without it, or that holds a user's id, which erasing the user
  // would need to empty: the user's own row and sessions go with them, and kept tables by their foreign keys.
  it.each((builtInModules as readonly ModuleDeclaration[]).filter(({ columns }) => columns !== undefined).map(({ id }) => id as ModuleId))('retires only nullable columns that hold no user id, of %s', (module) => {
    const declaration = (builtInModules as readonly ModuleDeclaration[]).find(({ id }) => id === module)!
    const every = { ...names, names: resolveNames({ schema: 'auth', modules: allModules }) }
    for (const { table, column } of retiredColumns(every, module, allModules)) {
      const attribute = declaration.columns![table.table]![column.column]!.attribute
      expect(attribute?.required ?? false, `${table}.${column} needs a check before it is required again`).toBe(false)
      expect(attribute?.references?.model, `${table}.${column} needs emptying when its user is erased`).not.toBe('user')
    }
  })

  it("keeps a personal access token's organization required, as tokens made while organizations are off are made in the default one", () => {
    expect(keepStatements(names, 'organizations', names.names.modules).map(ddlText).join('\n')).not.toContain('personal_access_token')
  })

  it('leaves alone the token table of a store without personal access tokens, or of a module turned on in the same migration', () => {
    expect(keepStatements(settingsStoreNames({}), 'organizations', names.names.modules).map(ddlText).join('\n')).not.toContain('personal_access_token')
    const before = names.names.modules.filter((module) => module !== 'personal_access_tokens')
    expect(keepStatements(names, 'organizations', before).map(ddlText).join('\n')).not.toContain('personal_access_token')
  })

  it('counts the rows of the tables its steps up to the kept one made, once on again, unless forced', () => {
    expect(keptTables(names, 'mail_senders', 1).map(({ name }) => name)).toEqual(['mail_sender'])
    expect(keptTables(names, 'mail_senders', 5).map(({ name }) => name)).toEqual(['mail_sender', 'mail_sender_verification'])
    const check = revivalCheckSql(names, 'personal_access_tokens', 1)
    expect(check).toContain(`if coalesce(current_setting('protobase.force', true), '') <> 'true' then`)
    expect(check).toContain("raise exception '%', format('The personal_access_tokens module was kept while off, and its tables still hold rows: %s.")
  })
})
