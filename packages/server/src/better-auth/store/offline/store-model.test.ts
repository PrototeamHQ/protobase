import { describe, expect, it } from 'vitest'
import { latestSteps, storeModel, storeNamesList } from './store-model'
import { settingsStoreNames } from './settings-names'

const names = settingsStoreNames({ tables: { user: { name: 'users', columns: { role: 'app_role' } } } })

describe('the store model', () => {
  it('holds every module at its last step, with each table, column and index as the config names them', () => {
    const model = storeModel(names, latestSteps(names.names.modules))
    expect(model).toMatchObject({ schema: 'auth', ids: 'text', userKeyTable: null, userMetadata: null, scopedTablesCarryOrganization: true })
    expect(model.modules.auth?.lastStep).toBe(5)
    expect(model.modules.auth?.tables.user).toMatchObject({ name: 'users', scope: 'global' })
    expect(model.modules.auth?.tables.user?.columns.role).toBe('app_role')
    expect(model.modules.passkeys?.tables.passkey?.indexes).toEqual({ passkey_user_id_idx: 'passkey_user_id_idx', passkey_credential_id_idx: 'passkey_credential_id_idx', passkey_rp_id_idx: 'passkey_rp_id_idx' })
  })

  it('leaves out a module the last steps leave out', () => {
    expect(Object.keys(storeModel(names, { auth: 3 }).modules)).toEqual(['auth'])
  })

  it('records uuid ids, the key table under a user view and the metadata column', () => {
    const model = storeModel(settingsStoreNames({ generateUserId: 'uuid', users: { keyTable: { schema: 'auth', table: 'users' }, metadata: 'raw_user_meta_data' } }), { auth: 5 })
    expect(model).toMatchObject({ ids: 'uuid', userKeyTable: 'auth.users', userMetadata: 'raw_user_meta_data' })
    expect(storeModel(settingsStoreNames({ generateUserId: 'uuid' }, true), {}).ids).toBe('text')
  })

  it('lists every name the store has, sorted', () => {
    const list = storeNamesList(storeModel(names, { auth: 5 }))
    expect(list[0]).toBe('auth')
    expect(list).toContain('auth.users.app_role')
    expect(list).toContain('auth.auth_migrations')
    expect(list).toEqual([...list].sort())
  })
})
