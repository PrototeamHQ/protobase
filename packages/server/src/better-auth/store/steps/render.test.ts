import { describe, expect, it } from 'vitest'
import type { ModuleId } from '../../names/modules'
import { resolveNames } from '../../names/resolve-names'
import { userTable } from '../../user-table'
import { ddlText } from '../ddl'
import { renderSteps, type Had } from './render'
import { migrationNames } from './step'

// The default organization the organizations' steps write rows from.
const organizations = { default: { id: 'main', name: 'Main', slug: 'main' }, existingUsersRole: 'sales' }

const render = (modules: ModuleId[], had: Had = () => false) => {
  const names = resolveNames({ schema: undefined, modules })
  return renderSteps(migrationNames({ schema: undefined, names, users: userTable(), uuidIds: false }), modules, had, organizations).map(({ module, step, on }) => `${module} ${step.step}${on ? ` on ${on}` : ''}`)
}

// The store has every step of these modules up to the number given, and what they add to one another's tables.
const upTo =
  (reached: Partial<Record<ModuleId, number>>): Had =>
  (module, step, target) =>
    step <= (reached[module] ?? 0) && (target === module || reached[target] !== undefined)

describe('rendering the steps', () => {
  it('renders every step of each module that is on, a module’s after those of the modules it requires', () => {
    expect(render(['auth', 'two_factor', 'organizations', 'personal_access_tokens'])).toEqual([
      'auth 1',
      'auth 2',
      'auth 3',
      'auth 4',
      'auth 5',
      'two_factor 1',
      'two_factor 1 on auth',
      'organizations 1',
      'organizations 1 on auth',
      'organizations 2',
      'organizations 3',
      'personal_access_tokens 1',
      'organizations 1 on personal_access_tokens',
      'organizations 3 on personal_access_tokens',
    ])
  })

  it('renders nothing of a module that is off, nor what other modules add to its tables', () => {
    expect(render(['auth', 'organizations'])).toEqual(['auth 1', 'auth 2', 'auth 3', 'auth 4', 'auth 5', 'organizations 1', 'organizations 1 on auth', 'organizations 2', 'organizations 3'])
  })

  it('renders only the steps a store lacks after an upgrade', () => {
    expect(render(['auth', 'passkeys', 'staff_sign_in'], upTo({ auth: 3, passkeys: 1, staff_sign_in: 2 }))).toEqual(['auth 4', 'auth 5', 'passkeys 2'])
    expect(render(['auth', 'passkeys'], upTo({ auth: 5, passkeys: 2 }))).toEqual([])
  })

  it('renders a module turned on whole, with what the modules the store has add to its tables', () => {
    expect(render(['auth', 'organizations', 'personal_access_tokens'], upTo({ auth: 5, organizations: 3 }))).toEqual(['personal_access_tokens 1', 'organizations 1 on personal_access_tokens', 'organizations 3 on personal_access_tokens'])
    expect(render(['auth', 'organizations', 'personal_access_tokens'], upTo({ auth: 5, personal_access_tokens: 1 }))).toEqual([
      'organizations 1',
      'organizations 1 on auth',
      'organizations 1 on personal_access_tokens',
      'organizations 2',
      'organizations 3',
      'organizations 3 on personal_access_tokens',
    ])
  })

  it('renders what a step added to a module that was off while it ran, once that module is on again', () => {
    const had: Had = (module, step, target) => upTo({ auth: 5, organizations: 3, personal_access_tokens: 1 })(module, step, target) && !(module === 'organizations' && target === 'personal_access_tokens')
    expect(render(['auth', 'organizations', 'personal_access_tokens'], had)).toEqual(['organizations 1 on personal_access_tokens', 'organizations 3 on personal_access_tokens'])
  })

  it('starts a step with its check', () => {
    const names = resolveNames({ schema: undefined })
    const [accountKeys] = renderSteps(migrationNames({ schema: undefined, names, users: userTable(), uuidIds: false }), ['auth'], upTo({ auth: 1 }), organizations)
    expect(accountKeys!.statements.map(ddlText)[0]).toMatch(/^do \$check\$/)
  })
})
