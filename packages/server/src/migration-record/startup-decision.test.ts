import { describe, expect, it } from 'vitest'
import { settingsStoreNames } from '../better-auth/store/offline/settings-names'
import { latestSteps, storeModel, type LastSteps } from '../better-auth/store/offline/store-model'
import { f, resource } from '@protobase/schema'
import { functionsVersion } from '../jobs/functions-sql'
import { neededModules } from '../schema-modules/needed-modules'
import { latestModules } from '../schema-modules/modules'
import type { RecordModel } from './record-model'
import type { RecordState } from './record-state'
import { startupRefusal } from './startup-decision'

const names = settingsStoreNames({})
const runtime: RecordModel = { auth: storeModel(names, latestSteps(names.names.modules)) }
const at = (steps: LastSteps): RecordModel => ({ auth: storeModel(names, { ...latestSteps(names.names.modules), ...steps }) })
const state = (model: RecordModel | undefined, rest: Partial<RecordState> = {}): RecordState => ({
  newest: model && { name: '004_auth', version: '0.14.1', model },
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
    expect(startupRefusal(runtime, state(runtime, { matched: true, unfinished: [plain] }), '0.14.2')).toBeUndefined()
    const unique = { name: '006_indexes', after: [{ index: 'user_email_key', unique: true }] }
    expect(startupRefusal(runtime, state(runtime, { unfinished: [unique] }), '0.14.2')).toBe(
      "The database's migrations have not finished, so the server will not start: 006_indexes has not finished building the unique index user_email_key. Run `protobase migrate` to finish them.",
    )
    expect(startupRefusal(runtime, state(runtime, { unfinished: [{ name: '006_indexes', after: null }] }), '0.14.2')).toContain('006_indexes has not finished its .after.sql, whose indexes are not recorded')
  })

  describe('with the jobs schema', () => {
    const jobs = { lastStep: 1, replaceables: { functions: functionsVersion } }
    const withJobs: RecordModel = { ...runtime, modules: { jobs } }

    it('refuses a database whose record lacks it, naming its step', () => {
      expect(startupRefusal(withJobs, state(runtime, { matched: false }), '0.15.0')).toBe(
        'The database is behind Protobase 0.15.0, so the server will not start: the database lacks the jobs schema, which this version needs at step 1 (pg_boss_45). To bring the database up to 0.15.0, run `protobase migrate --plan` to see the migrations it will apply, then `protobase migrate`. Or run Protobase 0.14.1, the version the database matches.',
      )
    })

    it('refuses functions older than this version writes', () => {
      const older: RecordModel = { ...runtime, modules: { jobs: { lastStep: 1, replaceables: { functions: functionsVersion - 1 } } } }
      expect(startupRefusal(withJobs, state(older), '0.15.0')).toContain(`the jobs schema has its functions at version ${functionsVersion - 1}, and this version needs version ${functionsVersion}`)
    })

    it('refuses a database without a record, naming what writes it without sign-in too', () => {
      expect(startupRefusal({ modules: { jobs } }, state(undefined), '0.15.0')).toBe(
        'The database has no migration recorded in migrations.history, so the server will not start: this version of Protobase needs the jobs schema. Write the migration that makes and records it with `protobase migration`, or with `protobase migration baseline` for a schema a migration of an earlier version made, run `protobase migrate --plan` to see it, then `protobase migrate`.',
      )
    })

    it('starts on a record that holds a module this version does not read', () => {
      expect(startupRefusal(runtime, state(withJobs, { matched: true }), '0.15.0')).toBeUndefined()
    })

    // A migration that replaced the functions with a version marked compatible is additive (`moduleDifference`); one not marked is not.
    it('lets the version before start after functions marked compatible, and refuses it after functions not marked', () => {
      const newer: RecordModel = { ...runtime, modules: { jobs: { lastStep: 1, replaceables: { functions: functionsVersion + 1 } } } }
      expect(startupRefusal(withJobs, state(newer, { matched: true }), '0.15.0')).toBeUndefined()
      expect(startupRefusal(withJobs, state(newer, { matched: true, notAdditiveSince: ['007_jobs'] }), '0.15.0')).toContain('it has migrations that break older code since the one this version reads: 007_jobs')
    })
  })

  describe('with the change capture', () => {
    const notes = resource('notes').table('notes').fields({ id: f.integer(), body: f.text() }).primaryKey((r) => r.id).events((e) => e.crud())
    const app = (models = [notes.toModel()], events?: { schema: string }) => ({ modules: latestModules(neededModules({ models, views: [], jobs: [], signIn: false, ...(events && { events }) })) })

    it('refuses a database whose record lacks the change capture, naming it', () => {
      expect(startupRefusal(app(), state({ modules: { jobs: app().modules.jobs! } }), '0.15.0')).toContain('the database lacks the change capture, which this version needs at step 1 (outbox)')
    })

    it("refuses a resource's triggers the record lacks or has for other fields, and the changes schema named otherwise", () => {
      const other = resource('other').table('other').fields({ id: f.integer() }).primaryKey((r) => r.id).events((e) => e.crud())
      expect(startupRefusal(app([notes.toModel(), other.toModel()]), state(app()), '0.15.0')).toContain('the change capture lacks its triggers of other')
      const sensitive = notes.fields({ id: f.integer(), body: f.text().sensitive() })
      expect(startupRefusal(app([sensitive.toModel()]), state(app()), '0.15.0')).toContain('the change capture has its triggers of notes otherwise than this version writes them for the config')
      expect(startupRefusal(app(undefined, { schema: 'events' }), state(app()), '0.15.0')).toContain(`the change capture's schema is "changes" in the database and "events" now`)
    })

    it('starts on a record that holds it, whatever it keeps for older code', () => {
      expect(startupRefusal(app(), state(app(), { matched: true }), '0.15.0')).toBeUndefined()
    })
  })

  describe('with webhooks, workflows and notifications', () => {
    const app = (rest: Partial<Parameters<typeof neededModules>[0]>) => ({ modules: latestModules(neededModules({ models: [], views: [], jobs: [], signIn: false, ...rest })) })

    it('refuses a database whose record lacks one, naming it and its step', () => {
      const webhooks = app({ webhooks: { deliveryLog: true } })
      expect(startupRefusal(webhooks, state(app({ webhooks: {} })), '0.15.0')).toContain('the database lacks the webhook delivery log, which this version needs at step 1 (delivery_log)')
      expect(startupRefusal(app({ workflows: { customSteps: true } }), state(app({ webhooks: {} })), '0.15.0')).toContain("the database lacks the workflows' custom steps, which this version needs at step 1 (custom_steps)")
      expect(startupRefusal(app({ notifications: {} }), state({ modules: { jobs: app({ webhooks: {} }).modules.jobs! } }), '0.15.0')).toContain('the database lacks the devices table of notifications, which this version needs at step 1 (devices)')
    })

    it('refuses a schema, table or column the config names otherwise than the record', () => {
      expect(startupRefusal(app({ webhooks: { schema: 'hooks' } }), state(app({ webhooks: {} })), '0.15.0')).toContain(`the webhooks schema's schema is "webhooks" in the database and "hooks" now`)
      expect(startupRefusal(app({ workflows: { schema: 'flows' } }), state(app({ workflows: {} })), '0.15.0')).toContain(`the workflows schema's schema is "workflows" in the database and "flows" now`)
      const renamed = app({ notifications: { devices: { columns: { token: 'address' } } } })
      expect(startupRefusal(renamed, state(app({ notifications: {} })), '0.15.0')).toContain(`the devices table of notifications's column.token is "token" in the database and "address" now`)
    })

    it('starts on a record that holds them', () => {
      const all = app({ webhooks: { deliveryLog: true }, workflows: { storage: {}, customSteps: true }, notifications: {} })
      expect(startupRefusal(all, state(all, { matched: true }), '0.15.0')).toBeUndefined()
    })
  })
})
