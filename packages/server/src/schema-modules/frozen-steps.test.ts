import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { notificationsTargets } from '../notifications/notifications-targets'
import { schemaModules, type SchemaModuleId } from './modules'
import type { ModuleNames } from './schema-module'

// Names each module's steps are written with here; the default ones the config gives.
const notifications = notificationsTargets({}, undefined)
const names: Record<SchemaModuleId, ModuleNames> = {
  jobs: {},
  mail_feedback: {},
  computed: {},
  changes: { schema: 'changes' },
  change_stream: { schema: 'changes' },
  history: { schema: 'changes' },
  derived: {},
  notices: { schema: 'changes' },
  comments: {},
  webhooks: { schema: 'webhooks', changes: 'changes' },
  webhook_delivery_log: { schema: 'webhooks' },
  workflows: { schema: 'workflows' },
  workflow_storage: { schema: 'workflows' },
  workflow_custom_steps: { schema: 'workflows' },
  notification_devices: notifications.notification_devices!.names,
  notification_history: notifications.notification_history!.names,
  status: { schema: 'status', table: 'statuses', users: '"auth"."user"', user_id_type: 'text' },
  calls: {},
  relay: { sessions: '"auth"."session"' },
  realtime_relay: {},
  channel_sends: {},
  user_tables: {},
  unsubscribes: {},
  query: {},
}

// The SHA-256 of each step's statements, by module and step. Steps that call builders shared with other code, such as
// the workflows' tables, are pinned here so an edit to one of them fails this test.
const pinned: Record<string, string> = {
  'jobs 1': '5b539ac15e3656f8',
  'mail_feedback 1': 'be4f83f7805e3736',
  'computed 1': '847f661dba56a7b8',
  'changes 1': '5889c9ed5e886936',
  'change_stream 1': 'cd0d9a8a8cf0c08c',
  'history 1': '43a670bbef1d4916',
  'notices 1': 'd2b58c96a65b1012',
  'comments 1': '12e989b42111e36b',
  'webhooks 1': '72e2929c874f211f',
  'webhook_delivery_log 1': '27c83604d0ff8f46',
  'workflows 1': '8415d6a249c3a621',
  'workflow_storage 1': 'ad32f20da1b4cbf7',
  'workflow_custom_steps 1': '9f4813440406f27c',
  'notification_devices 1': 'fa32cb6858f782fa',
  'notification_history 1': '3e7f2dff386f3b13',
  'status 1': 'df66cb640ee3510b',
  'calls 1': '6203854787c707ff',
  'calls 2': '4006b664d06319be',
  'relay 1': '3cc7f6bbecb6ec6a',
  'realtime_relay 1': '38dc32ccc845ebdd',
  'channel_sends 1': 'a28df48b0ec89ee7',
  'derived 1': 'ce48df951c75a615',
  'user_tables 1': '11c037437f43c712',
  'unsubscribes 1': 'e4eaab53ba7582c7',
  'query 1': '2d150fd084bd7092',
}

const digests = () =>
  Object.fromEntries(
    (Object.keys(schemaModules) as SchemaModuleId[]).flatMap((id) => schemaModules[id].steps.map(({ step, sql }) => [`${id} ${step}`, createHash('sha256').update(sql(names[id])).digest('hex').slice(0, 16)])),
  )

describe('the steps of the schema modules', () => {
  it('stay as they were released', () => {
    expect(
      digests(),
      'A step changed. Once released, a step never changes: copy its statements as they were into a frozen file the step reads, and write the change as a step of its own. A step not released yet may change: update its digest here.',
    ).toEqual(pinned)
  })
})
