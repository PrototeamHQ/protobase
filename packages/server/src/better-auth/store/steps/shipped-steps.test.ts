import { describe, expect, it } from 'vitest'
import { builtInModules } from '../../names/modules'
import { resolveNames, type NamesInput } from '../../names/resolve-names'
import { userTable, type UserTableOptions } from '../../user-table'
import { ddl, ddlText } from '../ddl'
import { statementsSql } from '../migration-sql'
import { legacyVersions } from './legacy-versions'
import { renderSteps } from './render'
import { lintSteps } from './step-lint'
import { migrationNames } from './step'
import { moduleSteps } from '.'

// Every step Protobase ships, rendered with each kind of configured name that changes its SQL.
const configs: Record<string, { input: NamesInput; users?: UserTableOptions; uuidIds?: boolean }> = {
  'the built-in names': { input: { schema: undefined } },
  'a schema, a prefix, renamed tables and columns, and uuid ids': {
    input: { schema: 'app_auth', tables: { prefix: 'app_', user: { name: 'users', columns: { role: 'app_role', email: 'mail' } }, account: { columns: { provider_id: 'provider' } }, personal_access_token: { columns: { organization_id: 'org' } } } },
    users: { metadata: 'raw_user_meta_data' },
    uuidIds: true,
  },
  'a user view': { input: { schema: 'app_auth' }, users: { keyTable: { schema: 'auth', table: 'users' } } },
}

describe('the steps Protobase ships', () => {
  it('number each module’s chain from 1, one after another', () => {
    for (const [module, steps] of Object.entries(moduleSteps)) expect(steps.map(({ step }) => step), module).toEqual(steps.map((_, i) => i + 1))
  })

  it('are the only source of each module’s tables: every one is made by one step of its own module', () => {
    for (const module of builtInModules) {
      const made = moduleSteps[module.id].flatMap(({ tables }) => tables)
      // The user table is made by the first step itself, as it may be another system's; the record of migrations goes first.
      const declared = Object.keys(module.tables).filter((table) => table !== 'user' && table !== 'auth_migrations')
      expect(made.toSorted(), module.id).toEqual(declared.toSorted())
    }
  })

  it('each come from a version of the former chain', () => {
    const versions = legacyVersions.map(({ version }) => version)
    for (const steps of Object.values(moduleSteps)) for (const step of steps) expect(versions).toContain(step.version)
  })

  for (const [label, { input, users = {}, uuidIds = false }] of Object.entries(configs)) {
    it(`are each safe to apply unattended, with ${label}`, () => {
      const names = resolveNames(input)
      const rendered = renderSteps(migrationNames({ schema: input.schema, names, users: userTable(users), uuidIds }), names.modules, () => false)
      const steps = rendered.map(({ module, step, on, statements }) => ({
        label: `${module} ${step.step} ${step.name}${on ? ` on ${on}` : ''}`,
        sql: statementsSql(statements),
        made: on ? [] : step.tables.map((table) => ddlText(ddl`${names.tables[table]!}`)),
        checked: !on && step.check !== undefined,
      }))
      expect(lintSteps(steps)).toEqual([])
    })
  }
})
