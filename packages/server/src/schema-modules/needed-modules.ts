import type { ResourceModel } from '@protobase/schema'
import { capturedBy } from '../changes/capture-sql'
import { hasBuckets } from '../computed/buckets-schema'
import { mailFeedbackResource } from '../mail/feedback/mail-feedback-resource'
import type { RealtimeOptions } from '../realtime/relay/realtime-options'
import { appRelayChannels, type RelayApp } from '../relay/realtime-channels'
import type { SchemaModuleId } from './modules'

/** What of an app decides which schema modules it needs. */
export type ModuleApp = {
  models: readonly ResourceModel[]
  views: RelayApp['views']
  /** The app's own jobs. */
  jobs: readonly unknown[]
  signIn: boolean
  mailFeedback?: boolean
  webhooks?: unknown
  workflows?: unknown
  notifications?: unknown
  realtime?: RealtimeOptions
}

/**
 * The schema modules `app` needs, in their order: the same for `protobase migration`, which writes them, and the
 * server, which reads the record of migrations for them.
 */
export const neededModules = (app: ModuleApp): SchemaModuleId[] => {
  // Mail feedback's events are captured from its table like the app's own resources' events.
  const captured = app.mailFeedback ? [...app.models, mailFeedbackResource.toModel()] : app.models
  const comments = app.models.some((model) => model.comments)
  const aiFields = app.models.some((model) => Object.values(model.fields).some((field) => field.ai))
  // The relay's channels the app uses or can be moved to by the platform's switch, which the developer's environment lacks.
  const relayChannels = appRelayChannels(app.realtime?.relay, { views: app.views, models: app.models, signIn: app.signIn })
  // Events and history are captured with a dispatch job, events delivered, mentions mailed, AI fields filled and
  // notifications sent by jobs, whose waiting and failed ones webhooks lists, workflows run by them, and time rollups
  // refreshed by one.
  const jobs = app.jobs.length > 0 || captured.some(capturedBy(captured)) || comments || aiFields || app.models.some(hasBuckets) || Boolean(app.webhooks || app.workflows || app.notifications || relayChannels)
  return jobs ? ['jobs'] : []
}
