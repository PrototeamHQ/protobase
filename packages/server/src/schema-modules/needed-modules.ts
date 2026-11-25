import type { ResourceModel } from '@protobase/schema'
import type { StoreNames } from '../better-auth/store/store-names'
import { capturedBy } from '../changes/capture-sql'
import { changesInput } from '../changes/changes-input'
import { changesSchema, type EventsOptions } from '../changes/events-options'
import { hasBuckets } from '../computed/buckets-targets'
import { computedInput, computedOn } from '../computed/computed-input'
import { derivedInput } from '../derived/derived-module'
import { derivedNames } from '../derived/derived-sql'
import { mailFeedbackResource } from '../mail/feedback/mail-feedback-resource'
import type { NotificationsOptions } from '../notifications/options'
import { notificationsTargets } from '../notifications/notifications-targets'
import { relayed, sqlSends, type RealtimeOptions } from '../realtime/relay/realtime-options'
import { relayInput } from '../relay/relay-targets'
import { appRelayChannels, type RelayApp } from '../relay/realtime-channels'
import type { StatusOptions } from '../status/options'
import { statusTargets } from '../status/status-targets'
import type { WebhooksOptions } from '../webhooks/table/options'
import { webhooksTargets } from '../webhooks/table/webhooks-targets'
import type { WorkflowsOptions } from '../workflows/options'
import { workflowsTargets } from '../workflows/workflows-targets'
import type { ModuleTargets } from './modules'
import { noInput } from './schema-module'

/** What of an app decides which schema modules it needs. */
export type ModuleApp = {
  models: readonly ResourceModel[]
  views: RelayApp['views']
  /** The app's own jobs. */
  jobs: readonly unknown[]
  signIn: boolean
  /** The auth store's names with sign-in on, whose users the notifications and statuses tables point at and whose sessions the relay's trigger is on. */
  authStore?: StoreNames
  mailFeedback?: boolean
  unsubscribe?: boolean
  webhooks?: WebhooksOptions
  workflows?: Pick<WorkflowsOptions, 'schema' | 'storage' | 'customSteps'>
  notifications?: NotificationsOptions
  status?: StatusOptions
  calls?: object
  realtime?: RealtimeOptions
  /** Where captured changes live (`events` in `protobase.config.ts`). */
  events?: EventsOptions
  /** Whether the tables users add serve (`userTables`). */
  userTables?: boolean
}

/**
 * The schema modules `app` needs, in their order, each with what it takes from the app: the same for `protobase
 * migration`, which writes them, and the server, which reads the record of migrations for them.
 */
export const neededModules = (app: ModuleApp): ModuleTargets => {
  // Mail feedback's events are captured from its table like the app's own resources' events.
  const captured = app.mailFeedback ? [...app.models, mailFeedbackResource.toModel()] : app.models
  const comments = app.models.some((model) => model.comments)
  const aiFields = app.models.some((model) => Object.values(model.fields).some((field) => field.ai))
  // The relay's channels the app uses or can be moved to by the platform's switch, which the developer's environment lacks.
  const relayChannels = appRelayChannels(app.realtime?.relay, { views: app.views, models: app.models, signIn: app.signIn })
  // Events and history are captured with a dispatch job, events delivered, mentions mailed, AI fields filled and
  // notifications sent by jobs, whose waiting and failed ones webhooks lists, workflows run by them, and time rollups
  // refreshed by one.
  const changes = captured.some(capturedBy(captured))
  const jobs = app.jobs.length > 0 || changes || comments || aiFields || app.models.some(hasBuckets) || Boolean(app.webhooks || app.workflows || app.notifications || relayChannels)
  // The history and notices tables live in the changes schema too; rings reach open pages through the notices.
  const events = { names: { schema: changesSchema(app.events) }, resources: {} }
  return {
    ...(jobs && { jobs: noInput }),
    ...(app.mailFeedback && { mail_feedback: noInput }),
    ...(app.models.some(computedOn) && { computed: computedInput(app.models) }),
    ...(changes && { changes: changesInput(captured, app.events) }),
    ...(app.models.some((model) => model.history) && { history: events }),
    ...(derivedNames(app.models).length > 0 && { derived: derivedInput(app.models) }),
    ...((app.models.some((model) => model.live) || Boolean(app.calls)) && { notices: events }),
    ...(comments && { comments: noInput }),
    ...(app.webhooks && webhooksTargets(app.webhooks, app.events)),
    ...(app.workflows && workflowsTargets(app.workflows)),
    ...(app.notifications && notificationsTargets(app.notifications, app.authStore)),
    ...(app.status && statusTargets(app.status, app.authStore)),
    ...(app.calls && { calls: noInput }),
    ...(relayChannels && { relay: relayInput(relayChannels, app.models, app.authStore) }),
    ...(relayed(app.realtime) && { realtime_relay: noInput }),
    ...(sqlSends(app.realtime) && { channel_sends: noInput }),
    ...(app.userTables && { user_tables: noInput }),
    ...(app.unsubscribe && { unsubscribes: noInput }),
  }
}
