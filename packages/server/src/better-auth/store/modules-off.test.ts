import { describe, expect, it } from 'vitest'
import { resolveNames } from '../names/resolve-names'
import { userTable } from '../user-table'
import { hadByVersion, refuseModulesOff } from './modules-off'
import { moduleSteps } from './steps'
import { renderSteps } from './steps/render'
import { migrationNames } from './steps/step'

const namesWith = (modules?: Parameters<typeof resolveNames>[0]['modules']) => ({ schema: undefined, names: resolveNames({ schema: undefined, modules }), users: userTable(), uuidIds: false })

describe('writing the store’s migrations with a module off', () => {
  it('takes every module on', () => {
    expect(() => refuseModulesOff(namesWith())).not.toThrow()
  })

  it('refuses a module that is off, naming it', () => {
    const modules = ['auth', 'two_factor', 'passkeys', 'sign_in_policy', 'staff_sign_in', 'organizations', 'mcp', 'personal_access_tokens', 'mail_senders'] as const
    expect(() => refuseModulesOff(namesWith(modules))).toThrow("The auth store's migrations are written with every module on, and platform_devices is off")
  })
})

describe('whether the store has a step, from the versions it recorded', () => {
  const step = (module: keyof typeof moduleSteps, number: number) => moduleSteps[module].find((step) => step.step === number)!

  it('counts a version for every module’s step naming it', () => {
    const had = hadByVersion([13])
    expect(had('passkeys', step('passkeys', 2))).toBe(true)
    expect(had('organizations', step('organizations', 2))).toBe(true)
    expect(had('organizations', step('organizations', 1))).toBe(false)
  })

  it('leaves pending exactly the steps of the versions not recorded, in every module', () => {
    const names = namesWith()
    const pending = renderSteps(migrationNames(names), names.names.modules, hadByVersion([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]))
      .filter(({ on }) => on === undefined)
      .map(({ module, step }) => `${module} ${step.step}`)
    const expected = Object.entries(moduleSteps).flatMap(([module, steps]) => steps.filter(({ version }) => version >= 13).map((step) => `${module} ${step.step}`))
    expect(pending.toSorted()).toEqual(expected.toSorted())
  })
})
