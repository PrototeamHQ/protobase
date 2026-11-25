import { describe, expect, it } from 'vitest'
import { resolveNames } from '../../names/resolve-names'
import { allModules } from '../../names/modules-on'
import { stepsOfVersions } from '../legacy-record'
import { legacyVersions } from '../steps/legacy-versions'
import { baselineStore, recordedSteps, type LiveStore } from './baseline-store'
import { settingsStoreNames } from './settings-names'
import { latestSteps } from './store-model'

// Every feature with tables of its own on, so every module is.
const names = settingsStoreNames({ organizations: { enabled: true }, mcp: true, personalAccessTokens: { prefix: 'app_' }, personalMail: ['gmail'], signInDevices: true })
const versionsTo = (last: number) => legacyVersions.filter(({ version }) => version <= last).map(({ version }) => version)
const stepsTo = (last: number) => stepsOfVersions(versionsTo(last))

// A store with every table and column of every module, as the former chain made it, recording versions up to `last`.
const liveStore = (last: number, userKind = 'r'): LiveStore => ({
  applied: stepsTo(last),
  relations: Object.fromEntries(
    Object.values(resolveNames({ schema: 'auth', modules: allModules }).tables).map((table) => [table.name, { kind: table.internal === 'user' ? userKind : 'r', columns: Object.values(table.columns).map(({ name }) => name) }]),
  ),
})

describe('recordedSteps', () => {
  it('refuses a step this Protobase does not ship, rather than stopping before it', () => {
    expect(() => recordedSteps([...stepsTo(17), { module: 'auth', step: 7, target: 'auth' }])).toThrow('The auth store records step 7 of auth, which this version of Protobase does not ship; upgrade Protobase')
  })

  it("maps the former chain's versions 1 to 8 onto each module's first steps", () => {
    expect(recordedSteps(stepsTo(8))).toEqual({ auth: 1, two_factor: 1, passkeys: 1, sign_in_policy: 1, staff_sign_in: 1, organizations: 1, mcp: 1, personal_access_tokens: 1 })
  })

  it('takes every step of a store at the latest version', () => {
    expect(recordedSteps(stepsTo(legacyVersions.at(-1)!.version))).toEqual(latestSteps(allModules))
  })

  it('stops a module at the first step whose version the store lacks', () => {
    expect(recordedSteps(stepsOfVersions([...versionsTo(8), 12])).auth).toBe(1)
  })

})

describe('baselineStore', () => {
  it('records each module that is on at its step, organizations as ever on, nothing kept and nothing external', () => {
    expect(baselineStore(names, liveStore(8))).toEqual({ lastSteps: recordedSteps(stepsTo(8)), kept: [], organizationsEverOn: true, external: [] })
  })

  it('records a module that is off but has tables as kept, such as personal access tokens', () => {
    const off = settingsStoreNames({})
    const without = { ...off, names: resolveNames({ schema: 'auth', modules: allModules.filter((module) => module !== 'personal_access_tokens') }) }
    const store = baselineStore(without, liveStore(17))
    expect(store.kept).toMatchObject([{ module: 'personal_access_tokens', step: 1, tables: { personal_access_token: { name: 'personal_access_token', columns: { token_hash: 'token_hash' } } } }])
    expect(store.lastSteps.personal_access_tokens).toBeUndefined()
  })

  it('reads organizations as never on when no table whose rows belong to one has the column that names it', () => {
    const live = liveStore(17)
    for (const table of ['member', 'invitation', 'personal_access_token']) live.relations[table] = { kind: 'r', columns: [] }
    expect(baselineStore(names, live).organizationsEverOn).toBe(false)
  })

  it('refuses a user table the database has as a view without users.keyTable', () => {
    expect(() => baselineStore(names, liveStore(17, 'v'))).toThrow("The auth store's user is a view or another relation that is not a table: name the table that holds the user ids in users.keyTable")
  })

  it('reads no inherited key as a relation, so a user table named constructor that is missing is refused', () => {
    const named = settingsStoreNames({ tables: { user: { name: 'constructor' } } })
    const live = liveStore(17)
    delete live.relations.user
    expect(() => baselineStore(named, live)).toThrow("The auth store's schema lacks constructor")
  })

  it('records the user view of users.keyTable as external', () => {
    const keyed = settingsStoreNames({ users: { keyTable: { schema: 'public', table: 'people' } } })
    expect(baselineStore(keyed, liveStore(17, 'v')).external).toEqual(['auth.user'])
  })

  it('refuses a table a recorded step made that the schema lacks under the config name', () => {
    const renamed = settingsStoreNames({ tables: { passkey: { name: 'passkeys' } } })
    expect(() => baselineStore(renamed, liveStore(17))).toThrow("The auth store's schema lacks passkeys, which the steps the store recorded made")
  })
})
