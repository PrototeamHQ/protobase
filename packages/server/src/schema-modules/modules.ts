import { callsModule } from '../calls/calls-module'
import { channelSendsModule } from '../channels/sends-module'
import { computedModule } from '../computed/computed-module'
import { derivedModule } from '../derived/derived-module'
import { changesModule } from '../changes/changes-module'
import { commentsModule } from '../comments/comments-module'
import { historyModule } from '../history/history-module'
import { jobsModule } from '../jobs/jobs-module'
import { noticesModule } from '../live/notices-module'
import { mailFeedbackModule } from '../mail/feedback/mail-feedback-module'
import { unsubscribesModule } from '../mail/unsubscribe/unsubscribes-module'
import { notificationDevicesModule } from '../notifications/devices-module'
import { notificationHistoryModule } from '../notifications/history-module'
import { realtimeRelayModule } from '../realtime/relay/realtime-relay-module'
import { relayModule } from '../relay/relay-module'
import { statusModule } from '../status/status-module'
import { webhookDeliveryLogModule } from '../webhooks/table/delivery-log-module'
import { webhooksSchemaModule } from '../webhooks/table/webhooks-schema-module'
import { workflowCustomStepsModule } from '../workflows/custom-steps/custom-steps-module'
import { workflowStorageModule } from '../workflows/storage/storage-module'
import { workflowsSchemaModule } from '../workflows/workflows-schema-module'
import { userTablesModule } from '../user-tables/user-tables-module'
import { queryModule } from '../assistant/query-runner/query-module'
import type { ModuleInput, ModuleModel, SchemaModule } from './schema-module'
import { latestModel } from './module-difference'

// The built-in schemas that are modules with step chains, in the order their statements are written: the mail feedback
// table and the rollups and formulas before the change capture, whose triggers go on the one and may name the others' columns, the webhooks
// schema after the jobs schema its view reads, an option's own tables after the module whose tables they point at,
// the derived schema after the jobs schema its fill enqueues into, and the relay after the jobs schema whose enqueue
// its trigger calls. Every module goes after the auth store's steps, so the relay's trigger finds the sessions table.
export const schemaModules = {
  jobs: jobsModule,
  mail_feedback: mailFeedbackModule,
  computed: computedModule,
  changes: changesModule,
  history: historyModule,
  derived: derivedModule,
  notices: noticesModule,
  comments: commentsModule,
  webhooks: webhooksSchemaModule,
  webhook_delivery_log: webhookDeliveryLogModule,
  workflows: workflowsSchemaModule,
  workflow_storage: workflowStorageModule,
  workflow_custom_steps: workflowCustomStepsModule,
  notification_devices: notificationDevicesModule,
  notification_history: notificationHistoryModule,
  status: statusModule,
  calls: callsModule,
  relay: relayModule,
  realtime_relay: realtimeRelayModule,
  channel_sends: channelSendsModule,
  user_tables: userTablesModule,
  unsubscribes: unsubscribesModule,
  query: queryModule,
} satisfies Record<string, SchemaModule>

export type SchemaModuleId = keyof typeof schemaModules

/** The schema modules' part of a model, by module: in the snapshot, the record and the runtime alike. */
export type ModulesModel = Partial<Record<SchemaModuleId, ModuleModel>>

/** The schema modules an app needs, each with what it gives the module (`neededModules`), in their order. */
export type ModuleTargets = Partial<Record<SchemaModuleId, ModuleInput>>

/** The modules of `targets`, in their order. */
export const targetIds = (targets: ModuleTargets) => (Object.keys(schemaModules) as SchemaModuleId[]).filter((id) => targets[id])

/** The model of each module of `targets` this version of Protobase reads. */
export const latestModules = (targets: ModuleTargets): ModulesModel => Object.fromEntries(targetIds(targets).map((id) => [id, latestModel(schemaModules[id], targets[id])]))
