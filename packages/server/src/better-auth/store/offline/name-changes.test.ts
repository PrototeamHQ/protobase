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

  it('takes a module the snapshot lacks as new', () => {
    expect(nameChanges(model({}, { auth: 5 }), model({}, { auth: 5, passkeys: 2 } as never))).toEqual([])
  })
})
