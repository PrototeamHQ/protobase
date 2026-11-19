import type { ResourceModel } from '@protobase/schema'
import { hasAiFields } from './ai/ai-fields'
import { capturedBy } from './changes/capture-sql'
import { changesSchema, type EventsOptions } from './changes/events-options'
import { commentsResource, commentsView } from './comments/record-comments'
import { activityResource, activityView } from './history/activity'
import { failedJobs, failedJobsView } from './jobs/failed-jobs'
import { unsubscribesResource, unsubscribesView } from './mail/unsubscribe/unsubscribes-resource'

export type BuiltInInput = {
  models: ResourceModel[]
  /** Whether the app declares jobs of its own. */
  jobs: boolean
  /** Whether the app sends notifications. */
  notifications: boolean
  /** Whether bulk mail carries a one-click unsubscribe (`unsubscribe`). */
  unsubscribe?: boolean
  events?: EventsOptions
}

/**
 * The resources and views the API adds beside the app's own, by what the app uses: Failed jobs once anything runs
 * jobs (events, history, comments, AI fields, notifications or the app's jobs), Activity with history, Comments
 * with comments and Unsubscribes with `unsubscribe`.
 */
export const builtInResources = ({ models, jobs, notifications, unsubscribe = false, events }: BuiltInInput) => {
  const withComments = models.some((model) => model.comments)
  const withJobs = jobs || models.some(capturedBy(models)) || withComments || hasAiFields(models) || notifications
  const withHistory = models.some((model) => model.history)
  const resources = [
    ...(withJobs ? [failedJobs] : []),
    ...(withHistory ? [activityResource(changesSchema(events), { tenant: models.some((model) => model.history && model.tenant) })] : []),
    ...(withComments ? [commentsResource({ tenant: models.some((model) => model.comments && model.tenant) })] : []),
    ...(unsubscribe ? [unsubscribesResource] : []),
  ]
  const views = [...(withJobs ? [failedJobsView] : []), ...(withHistory ? [activityView] : []), ...(withComments ? [commentsView] : []), ...(unsubscribe ? [unsubscribesView] : [])]
  return { resources, views }
}
