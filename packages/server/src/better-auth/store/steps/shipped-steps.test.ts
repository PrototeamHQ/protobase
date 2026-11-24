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
      // The user table is made by the first step itself, as it may be another system's; the records of steps go first.
      const declared = Object.keys(module.tables).filter((table) => table !== 'user' && table !== 'auth_migrations' && table !== 'auth_steps')
      expect(made.toSorted(), module.id).toEqual(declared.toSorted())
    }
  })

  it('each come from a version of the former chain', () => {
    const versions = legacyVersions.map(({ version }) => version)
    for (const steps of Object.values(moduleSteps)) for (const step of steps) expect(versions).toContain(step.version)
  })

  // `auth_migrations` records versions, not steps, so a store that has a version has every step naming it: a step
  // released at a version keeps it, and a new step takes a version after every released one that no other step has,
  // or stores past that version would skip it.
  it('keep the versions they were released with, and a new step takes a later one of its own', () => {
    const released: Record<string, number> = {
      'auth 1': 1, 'auth 2': 11, 'auth 3': 12, 'auth 4': 13, 'auth 5': 14,
      'two_factor 1': 2,
      'passkeys 1': 3, 'passkeys 2': 13,
      'sign_in_policy 1': 4,
      'staff_sign_in 1': 5, 'staff_sign_in 2': 13,
      'organizations 1': 6, 'organizations 2': 13,
      'mcp 1': 7,
      'personal_access_tokens 1': 8,
      'mail_senders 1': 9, 'mail_senders 2': 10,
      'platform_devices 1': 11,
    }
    const latestReleased = Math.max(...Object.values(released))
    for (const [module, steps] of Object.entries(moduleSteps)) {
      for (const { step, version } of steps) {
        const key = `${module} ${step}`
        if (key in released) expect(version, key).toBe(released[key])
        else {
          expect(version, key).toBeGreaterThan(latestReleased)
          const sharing = Object.entries(moduleSteps).flatMap(([other, steps]) => steps.filter((step) => step.version === version).map((step) => `${other} ${step.step}`))
          expect(sharing, key).toEqual([key])
        }
      }
    }
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
