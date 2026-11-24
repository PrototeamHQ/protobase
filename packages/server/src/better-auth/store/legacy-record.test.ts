import { describe, expect, it } from 'vitest'
import { settingsStoreNames } from './offline/settings-names'
import { fillFromLegacySql, stepsOfVersions } from './legacy-record'

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
    expect(() => stepsOfVersions([1, 99])).toThrow('records version 99 in auth_migrations, which this version of Protobase does not ship')
  })
})

describe('filling auth_steps from auth_migrations', () => {
  const sql = fillFromLegacySql(settingsStoreNames({}))

  it('runs only once auth_migrations is there, keeping the time each version was recorded', () => {
    expect(sql).toMatch(/^-- The steps the store recorded by version in auth_migrations, recorded by step\.\ndo \$step\$ begin\nif to_regclass\('"auth"\."auth_migrations"'\) is not null then\n/)
    expect(sql).toContain('select part.module, part.step, part.target, legacy."applied_at"')
    expect(sql).toContain(`('passkeys', 2, 'passkeys', 13)`)
    expect(sql).toContain(`('organizations', 1, 'personal_access_tokens', 8)`)
    expect(sql).toContain('on conflict do nothing$statement$;')
  })
})
