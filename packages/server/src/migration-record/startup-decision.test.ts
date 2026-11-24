import { describe, expect, it } from 'vitest'
import { settingsStoreNames } from '../better-auth/store/offline/settings-names'
import { latestSteps, storeModel, type LastSteps } from '../better-auth/store/offline/store-model'
import { modelHash, type RecordModel } from './record-model'
import type { RecordState } from './record-state'
import { startupRefusal } from './startup-decision'

const names = settingsStoreNames({})
const runtime: RecordModel = { auth: storeModel(names, latestSteps(names.names.modules)) }
const at = (steps: LastSteps): RecordModel => ({ auth: storeModel(names, { ...latestSteps(names.names.modules), ...steps }) })
const state = (model: RecordModel | undefined, rest: Partial<RecordState> = {}): RecordState => ({
  newest: model && { name: '004_auth', version: '0.14.1', model, hash: modelHash(model) },
  matched: false,
  notAdditiveSince: [],
  unfinished: [],
  ...rest,
})

describe('startupRefusal', () => {
  it('starts on the model this version reads', () => {
    expect(startupRefusal(runtime, state(runtime, { matched: true }), '0.14.2')).toBeUndefined()
  })

  it('starts without sign-in, whatever the record holds', () => {
    expect(startupRefusal({}, state(undefined), '0.14.2')).toBeUndefined()
  })

  it('starts on a database ahead only by additive migrations', () => {
    expect(startupRefusal(runtime, state(at({ auth: 6 } as never), { matched: true }), '0.14.2')).toBeUndefined()
  })

  it('refuses a database ahead by a migration that is not additive, naming it and the versions', () => {
    expect(startupRefusal(runtime, state(at({ auth: 6 } as never), { matched: true, notAdditiveSince: ['005_rename'] }), '0.14.2')).toBe(
      'The database is ahead of Protobase 0.14.2, so the server will not start: it has migrations that break older code since the one this version reads: 005_rename. Rolling back to this version is blocked once they are applied: run Protobase 0.14.1, the version the database matches, or a later one.',
    )
  })

  it('refuses a database behind, naming each module and step it lacks', () => {
    const refusal = startupRefusal(runtime, state(at({ passkeys: 1 })), '0.14.2')
    expect(refusal).toBe(
      "The database is behind Protobase 0.14.2, so the server will not start: the auth store's passkeys module is at step 1 (passkeys), and this version needs step 2 (rp_id_index). To bring the database up to 0.14.2, run `protobase migrate --plan` to see the migrations it will apply, then `protobase migrate`. Or run Protobase 0.14.1, the version the database matches.",
    )
  })

  it('refuses a database that has no record', () => {
    expect(startupRefusal(runtime, state(undefined), '0.14.2')).toMatch(/^The database has no migration recorded in migrations\.history, so the server will not start: .*`protobase migrate`\.$/)
  })

  it('refuses a name the database has otherwise', () => {
    const renamed = settingsStoreNames({ tables: { user: { columns: { role: 'app_role' } } } })
    const other: RecordModel = { auth: storeModel(renamed, latestSteps(renamed.names.modules)) }
    expect(startupRefusal(runtime, state(other), '0.14.2')).toContain('the auth store\'s modules.auth.user.columns.role is "app_role" in the database and "role" now')
  })

  it('starts while a plain index is still building, and refuses on a unique one or an unknown one', () => {
    const plain = { name: '006_indexes', after: [{ index: 'user_email_idx', unique: false }] }
    expect(startupRefusal(runtime, state(runtime, { unfinished: [plain] }), '0.14.2')).toBeUndefined()
    const unique = { name: '006_indexes', after: [{ index: 'user_email_key', unique: true }] }
    expect(startupRefusal(runtime, state(runtime, { unfinished: [unique] }), '0.14.2')).toBe(
      "The database's migrations have not finished, so the server will not start: 006_indexes has not finished building the unique index user_email_key. Run `protobase migrate` to finish them.",
    )
    expect(startupRefusal(runtime, state(runtime, { unfinished: [{ name: '006_indexes', after: null }] }), '0.14.2')).toContain('006_indexes has not finished its .after.sql, whose indexes are not recorded')
  })
})
