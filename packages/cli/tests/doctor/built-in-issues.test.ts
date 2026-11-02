import { Kysely } from 'kysely'
import { describe, expect, it } from 'vitest'
import { tableIndexes } from '@protobase/query'
import { f, resource } from '@protobase/schema'
import { changesMigration, commentsMigration, webhooksMigration } from '@protobase/server'
import type { MergedConfig } from '../../src/config/merge-config'
import { builtInModels } from '../../src/doctor/built-in-models'
import { indexIssues } from '../../src/doctor/index-issues'
import { readShapes } from '../../src/doctor/read-shapes'
import { sortIssues } from '../../src/doctor/sort-issues'
import { openSnapshotDb } from '../../../../test-support/sql-snapshot'

// An app with webhooks and its delivery log, and a resource that keeps history and takes comments, so the API adds every
// built-in resource with a table of its own.
const notes = resource('notes')
  .table('notes')
  .fields({ id: f.integer(), body: f.text() })
  .primaryKey((r) => r.id)
  .history()
  .comments()
  .toModel()
const config = { webhooks: { deliveryLog: true }, jobs: {} } as unknown as MergedConfig
const builtIn = builtInModels(config, [notes])
const shapes = readShapes({ models: [...builtIn.models, notes], views: builtIn.views, pages: [] })

// The webhooks schema as version 1 wrote it: the subscriptions table with only the tenant's index.
const earlierWebhooks = `
  comment on function webhooks.subscription_commands() is 'Protobase webhooks 1';
  comment on function webhooks.deliveries_resend() is 'Protobase webhooks 1';
  drop index webhooks.subscriptions_owner, webhooks.subscriptions_created_at, webhooks.subscriptions_name, webhooks.subscriptions_enabled,
    webhooks.subscriptions_last_success_at, webhooks.subscriptions_name_search, webhooks.subscriptions_url_search;
`

describe('doctor on the resources Protobase adds', () => {
  it('checks the webhook, activity and comments resources the config enables', () => {
    expect(builtIn.models.map((model) => model.name)).toEqual(['webhook_subscriptions', 'webhook_deliveries', 'webhook_delivery_log', 'failed_jobs', 'record_history', 'record_comments'])
    expect(builtInModels({ jobs: {} } as unknown as MergedConfig, []).models).toEqual([])
  })

  it('passes every built-in resource once migrated, fails each index the webhook subscriptions list misses, and passes again after the next migration', async () => {
    const pg = await openSnapshotDb('jobs')
    const db = new Kysely<any>({ dialect: pg.dialect })
    await pg.exec('create table notes (id integer primary key, body text not null)')
    await pg.exec((await changesMigration(db, [notes]))!)
    await pg.exec((await commentsMigration(db))!)
    await pg.exec((await webhooksMigration(db, { deliveryLog: true }))!)
    const issues = async () => (await Promise.all(builtIn.models.map(async (model) => [...sortIssues(model, shapes), ...indexIssues(model, await tableIndexes(db, model), shapes)]))).flat()
    expect(await issues()).toEqual([])

    await pg.exec(earlierWebhooks)
    const found = await issues()
    expect(found.map((issue) => `${issue.severity} ${issue.resource}: ${issue.message.split(',')[0]}`)).toEqual([
      'error webhook_subscriptions: no index serves the column "name"',
      'error webhook_subscriptions: no index serves the column "last_success_at"',
      'error webhook_subscriptions: no index serves the column "created_at"',
      'error webhook_subscriptions: no index serves the column "enabled"',
      'error webhook_subscriptions: no pg_trgm index serves the column "name"',
      'error webhook_subscriptions: no pg_trgm index serves the column "url"',
      'error webhook_subscriptions: no index serves the column "owner_id"',
    ])
    expect(found[2]!.message).toContain("GET /webhook_subscriptions?order_by=created_at desc (the webhook_subscriptions list's order)")

    // A database migrated before Activity and Comments had these indexes gets them from the next migration, as webhooks do.
    await pg.exec('drop index changes.history_operation, comments.comments_record_key')
    for (const migration of [await changesMigration(db, [notes]), await commentsMigration(db), await webhooksMigration(db, { deliveryLog: true })]) await pg.exec(migration!)
    expect(await issues()).toEqual([])
    await db.destroy()
  })
})
