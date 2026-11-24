import { describe, expect, it } from 'vitest'
import { nameChanges } from './name-changes'
import { settingsStoreNames } from './settings-names'
import { storeModel } from './store-model'

const model = (settings: Parameters<typeof settingsStoreNames>[0], steps = { auth: 5 }) => storeModel(settingsStoreNames(settings), steps)

describe('nameChanges', () => {
  it('finds none when only the steps differ', () => {
    expect(nameChanges(model({}, { auth: 3 }), model({}))).toEqual([])
  })

  it('names each name or type the store has that the config changes', () => {
    expect(nameChanges(model({}), model({ tables: { user: { columns: { role: 'app_role' } } }, generateUserId: 'uuid' }))).toEqual([
      'ids is "text" in the snapshot and "uuid" now',
      'modules.auth.user.columns.role is "role" in the snapshot and "app_role" now',
    ])
  })

  it('takes a scope an earlier Protobase declared otherwise as no change, as the tokens’ once all the app’s', () => {
    const now = model({ personalAccessTokens: { prefix: 'app_' } }, { auth: 5, personal_access_tokens: 1 } as never)
    const token = now.modules.personal_access_tokens!.tables.personal_access_token!
    const earlier = { ...now, modules: { ...now.modules, personal_access_tokens: { lastStep: 1, tables: { personal_access_token: { ...token, scope: 'global' as const } } } } }
    expect(nameChanges(earlier, now)).toEqual([])
  })

  it('takes a module the snapshot lacks as new', () => {
    expect(nameChanges(model({}, { auth: 5 }), model({}, { auth: 5, passkeys: 2 } as never))).toEqual([])
  })
})
