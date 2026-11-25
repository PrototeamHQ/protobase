import { describe, expect, it } from 'vitest'
import { settingsStoreNames } from './offline/settings-names'
import { stepsOfVersions, versionRecordTable } from './legacy-record'

const label = ({ module, step, target }: { module: string; step: number; target: string }) => `${module} ${step}${target === module ? '' : ` on ${target}`}`

describe('the parts of each version of the former chain', () => {
  it('maps a version several modules shared onto each of their steps', () => {
    expect(stepsOfVersions([13]).map(label)).toEqual(['auth 4', 'passkeys 2', 'staff_sign_in 2', 'organizations 2'])
    expect(stepsOfVersions([11]).map(label)).toEqual(['auth 2', 'platform_devices 1'])
  })

  it('maps what a module added to the tables of another onto the later of their versions', () => {
    expect(stepsOfVersions([6]).map(label)).toEqual(['organizations 1', 'organizations 1 on auth'])
    expect(stepsOfVersions([8]).map(label)).toEqual(['organizations 1 on personal_access_tokens', 'personal_access_tokens 1'])
  })

  it('refuses a version this Protobase does not ship', () => {
    expect(() => stepsOfVersions([1, 99])).toThrow('has version 99, which this version of Protobase does not ship')
  })
})

describe('the former record of versions', () => {
  it('is in the store’s schema, after its prefix', () => {
    expect(String(versionRecordTable(settingsStoreNames({})))).toBe('"auth"."auth_migrations"')
    expect(String(versionRecordTable(settingsStoreNames({ tables: { prefix: 'app_' } })))).toBe('"auth"."app_auth_migrations"')
  })
})
