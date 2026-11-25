import type { ResourceModel } from '@protobase/schema'
import type { StoreNames } from '../better-auth/store/store-names'
import { capturedBy } from '../changes/capture-sql'
import { changesInput } from '../changes/changes-input'
import { changesSchema, type EventsOptions } from '../changes/events-options'
import { hasBuckets } from '../computed/buckets-schema'
import { mailFeedbackResource } from '../mail/feedback/mail-feedback-resource'
import type { NotificationsOptions } from '../notifications/options'
import { notificationsTargets } from '../notifications/notifications-targets'
import type { RealtimeOptions } from '../realtime/relay/realtime-options'
import { appRelayChannels, type RelayApp } from '../relay/realtime-channels'
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
  /** The auth store's names with sign-in on, whose users the notifications tables point at. */
  authStore?: StoreNames
  mailFeedback?: boolean
  webhooks?: WebhooksOptions
  workflows?: Pick<WorkflowsOptions, 'schema' | 'storage' | 'customSteps'>
  notifications?: NotificationsOptions
  realtime?: RealtimeOptions
  /** Where captured changes live (`events` in `protobase.config.ts`). */
  events?: EventsOptions
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
  // The history and notices tables live in the changes schema too.
  const events = { names: { schema: changesSchema(app.events) }, resources: {} }
  return {
    ...(jobs && { jobs: noInput }),
    ...(changes && { changes: changesInput(captured, app.events) }),
    ...(app.models.some((model) => model.history) && { history: events }),
    ...(app.models.some((model) => model.live) && { notices: events }),
    ...(app.webhooks && webhooksTargets(app.webhooks, app.events)),
    ...(app.workflows && workflowsTargets(app.workflows)),
    ...(app.notifications && notificationsTargets(app.notifications, app.authStore)),
  }
}
