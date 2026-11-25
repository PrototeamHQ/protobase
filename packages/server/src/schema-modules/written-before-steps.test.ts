import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { settingsStoreNames } from '../better-auth/store/offline/settings-names'
import { relayInput } from '../relay/relay-targets'
import { querySchemaSql } from './feature-schemas-sql'
import { statusTargets } from '../status/status-targets'
import { f, resource } from '@protobase/schema'
import { callsSchemaSql, channelSendsSchemaSql, commentsSchemaSql, derivedSchemaSql, mailFeedbackSchemaSql, notificationsSchemaSql, realtimeRelaySchemaSql, unsubscribesSchemaSql, userTablesSchemaSql, webhooksSchemaSql, workflowsSchemaSql } from './feature-schemas-sql'
import { modulesSql } from './modules-sql'
import { sqlStatements } from './testing/sql-statements'

// Each `written-before-steps.sql` is what the feature's migration wrote on an empty database before it was a module:
// webhooks with the delivery log, workflows with storage and custom steps, notifications without sign-in, status and the
// relay with auth's default tables, the relay without listed channels, calls with the notices table, several processes
// and SQL's sends, derived values with one value declared, user tables, comments, mail feedback, unsubscribe, and the query
// role with no resource to read. Its steps and
// replaceables write the same statements, in another order; the relay's no longer deletes the members of resources not
// listed, which an empty database has none of.
const before = (path: string) => readFileSync(new URL(`../${path}/written-before-steps.sql`, import.meta.url), 'utf8')

// A resource with one derived value.
const notes = resource('notes').table('notes').fields({ id: f.integer(), summary: f.text().optional().readOnly() }).primaryKey((r) => r.id).derived('summary', { into: (r) => r.summary, reads: [] })

describe('the schema modules that had a migration of their own before', () => {
  it.each([
    ['webhooks/table', () => webhooksSchemaSql({ deliveryLog: true })],
    ['workflows', () => workflowsSchemaSql({ storage: {}, customSteps: true })],
    ['notifications', () => notificationsSchemaSql()],
    ['status', () => modulesSql(statusTargets({}, settingsStoreNames({})))],
    ['calls', () => callsSchemaSql()],
    ['relay', () => modulesSql({ relay: relayInput({}, [], settingsStoreNames({})) })],
    ['realtime/relay', () => realtimeRelaySchemaSql()],
    ['channels', () => channelSendsSchemaSql()],
    ['derived', () => derivedSchemaSql([notes.toModel()])],
    ['user-tables', () => userTablesSchemaSql()],
    ['comments', () => commentsSchemaSql()],
    ['mail/feedback', () => mailFeedbackSchemaSql()],
    ['mail/unsubscribe', () => unsubscribesSchemaSql()],
    ['assistant/query-runner', () => querySchemaSql([])],
  ])('write on an empty database the statements %s wrote before it had steps', (path, now) => {
    expect(sqlStatements(now())).toEqual(sqlStatements(before(path)))
  })
})
