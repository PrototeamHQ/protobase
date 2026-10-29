import type { Db } from '@protobase/query'
import { defineJob } from '../jobs/define-job'
import { holdJob, replaceJobData, saveJobProgress } from '../jobs/job-progress'
import type { JobContext } from '../jobs/job-types'
import { deliver, type DeliverySteps } from './deliver'
import { deviceStore } from './device-store-of'
import type { NewNotification } from './history'
import { historyStore } from './history-store-of'
import type { NotificationsOptions } from './options'
import { HistoryStoreError } from './postgres-history-store'
import { noProgress, pushPayload, type Progress } from './push-payload'
import { pushJobName } from './push-job-name'
import type { PushSender } from './sender'

// The history store's SQLSTATE when the user is gone: the history table's user points at auth's users table.
const userGone = '23503'

/**
 * Keeps the entry and the progress that marks it kept in one transaction, with the default store, so no try records
 * it twice. An app's own store records outside it. When the user was deleted since the send, the entry is not kept
 * and the user is marked all the same, after the transaction the failed insert ended.
 */
const recordOnce = (db: Db, options: NotificationsOptions, job: JobContext['job']) => async (userId: string, entry: NewNotification, progress: Progress) => {
  try {
    await db.transaction().execute(async (trx) => {
      await historyStore(trx, options).record(userId, entry)
      await saveJobProgress(trx, job, progress)
    })
  } catch (error) {
    if (!(error instanceof HistoryStoreError && error.sqlState === userGone)) throw error
    await saveJobProgress(db, job, progress)
  }
}

/**
 * The job that delivers what `sendNotification` sends, through `senders` (guarded, see `notificationSenders`) and the
 * stores `options` configure; with `liveSessions`, as with Protobase's auth, only to devices whose session stands, and
 * with `quiet`, as with `status`, to no device of a user on do not disturb. A
 * try resumes where the last one stopped (see `deliver`); once delivered, the job keeps no message. A few tries only: a
 * device that keeps asking for a retry is given up on the second time.
 */
export const pushJob = (options: NotificationsOptions, senders: readonly PushSender[], liveSessions?: DeliverySteps['liveSessions'], quiet?: (db: Db, userIds: readonly string[]) => Promise<Set<string>>) =>
  defineJob({
    name: pushJobName,
    payload: pushPayload,
    maxAttempts: 5,
    retryDelay: '1 minute',
    run: async (payload, { db, job }) => {
      if ('complete' in payload) return
      await deliver(payload, payload.progress ?? noProgress(), {
        devices: deviceStore(db, options),
        senders,
        record: recordOnce(db, options, job),
        save: (progress) => saveJobProgress(db, job, progress),
        hold: () => holdJob(db, job),
        complete: () => replaceJobData(db, job, { complete: true }),
        ...(liveSessions && { liveSessions }),
        ...(quiet && { quiet: (userIds: readonly string[]) => quiet(db, userIds) }),
      })
    },
  })
