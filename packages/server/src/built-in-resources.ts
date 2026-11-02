import type { ResourceModel } from '@protobase/schema'
import { hasAiFields } from './ai/ai-fields'
import { isCaptured } from './changes/capture-sql'
import { changesSchema, type EventsOptions } from './changes/events-options'
import { commentsResource, commentsView } from './comments/record-comments'
import { activityResource, activityView } from './history/activity'
import { failedJobs, failedJobsView } from './jobs/failed-jobs'

export type BuiltInInput = {
  models: ResourceModel[]
  /** Whether the app declares jobs of its own. */
  jobs: boolean
  /** Whether the app sends notifications. */
  notifications: boolean
  events?: EventsOptions
}

/**
 * The resources and views the API adds beside the app's own, by what the app uses: Failed jobs once anything runs
 * jobs (events, history, comments, AI fields, notifications or the app's jobs), Activity with history and Comments
 * with comments.
 */
export const builtInResources = ({ models, jobs, notifications, events }: BuiltInInput) => {
  const withComments = models.some((model) => model.comments)
  const withJobs = jobs || models.some(isCaptured) || withComments || hasAiFields(models) || notifications
  const withHistory = models.some((model) => model.history)
  const resources = [
    ...(withJobs ? [failedJobs] : []),
    ...(withHistory ? [activityResource(changesSchema(events), { tenant: models.some((model) => model.history && model.tenant) })] : []),
    ...(withComments ? [commentsResource({ tenant: models.some((model) => model.comments && model.tenant) })] : []),
  ]
  const views = [...(withJobs ? [failedJobsView] : []), ...(withHistory ? [activityView] : []), ...(withComments ? [commentsView] : [])]
  return { resources, views }
}
