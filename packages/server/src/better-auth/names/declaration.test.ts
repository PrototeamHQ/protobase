import { describe, expect, it } from 'vitest'
import type { ModuleDeclaration } from './declaration'
import { builtInModules } from './modules'
import { allModules } from './modules-on'
import { resolveNames } from './resolve-names'

const tables = resolveNames({ schema: undefined, modules: allModules }).tables

describe('the tables of the built-in modules', () => {
  it('declare what each index of a table of an organization’s rows serves, leading with the organization within one', () => {
    for (const table of Object.values(tables).filter((table) => table.scope === 'organization')) {
      expect(Object.keys(table.indexes).length, table.internal).toBeGreaterThan(0)
      for (const [index, scope] of Object.entries(table.indexes)) expect(index.startsWith(`${table.internal}_organization_id_`), index).toBe(scope === 'organization')
    }
  })

  it('give an index other modules add to a table only while the module adding it is on', () => {
    const declared = (builtInModules as readonly ModuleDeclaration[]).find(({ id }) => id === 'organizations')!.indexes!
    expect(Object.keys(declared)).toEqual(['personal_access_token'])
    expect(tables.personal_access_token!.indexes).toMatchObject(declared.personal_access_token!)
    const without = resolveNames({ schema: undefined, modules: allModules.filter((module) => module !== 'organizations') })
    expect(Object.keys(without.tables.personal_access_token!.indexes)).toEqual(['personal_access_token_user_id_idx'])
  })
})
