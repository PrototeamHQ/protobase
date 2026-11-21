import type { Db } from '@protobase/query'
import { dispatchJobName } from '../../changes/capture-sql'
import { runningJobs } from '../../jobs/current'
import { confirmSnsSubscription, mailFeedbackRoutes } from './feedback-routes'
import { readFeedbackSettings } from './feedback-settings'
import { recordFeedback } from './feedback-store'
import { fetchCertificate, keptCertificates } from './sns-certificates'

/**
 * The feedback endpoints over the app's database, with the providers `env` sets up: a report's records are written,
 * then this process's dispatcher raises their events at once rather than at its next poll.
 */
export const mailFeedbackApp = (db: Db, env: Record<string, string | undefined>) =>
  mailFeedbackRoutes({
    settings: readFeedbackSettings(env),
    record: async (report) => {
      await recordFeedback(db, report)
      if (report.records.length > 0) runningJobs()?.wake(dispatchJobName)
    },
    certificates: keptCertificates(fetchCertificate),
    confirm: confirmSnsSubscription,
  })
