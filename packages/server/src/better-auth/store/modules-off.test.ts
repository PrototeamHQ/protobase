import { describe, expect, it } from 'vitest'
import { resolveNames } from '../names/resolve-names'
import { userTable } from '../user-table'
import { refuseModulesOff } from './modules-off'

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
