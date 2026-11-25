import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { notificationsSchemaSql, webhooksSchemaSql, workflowsSchemaSql } from './feature-schemas-sql'
import { sqlStatements } from './testing/sql-statements'

// Each `written-before-steps.sql` is what the feature's migration wrote on an empty database before it was a module:
// webhooks with the delivery log, workflows with storage and custom steps, notifications without sign-in. Its steps and
// replaceables write the same statements, in another order.
const before = (path: string) => readFileSync(new URL(`../${path}/written-before-steps.sql`, import.meta.url), 'utf8')

describe('the schema modules that had a migration of their own before', () => {
  it.each([
    ['webhooks/table', () => webhooksSchemaSql({ deliveryLog: true })],
    ['workflows', () => workflowsSchemaSql({ storage: {}, customSteps: true })],
    ['notifications', () => notificationsSchemaSql()],
  ])('write on an empty database the statements %s wrote before it had steps', (path, now) => {
    expect(sqlStatements(now())).toEqual(sqlStatements(before(path)))
  })
})
