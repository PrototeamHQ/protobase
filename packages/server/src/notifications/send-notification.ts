import type { Db } from '@protobase/query'
import { currentJobs } from '../jobs/current'
import type { PushMessage } from './message'
import { pushJobName } from './push-job-name'
import { checkedSend, type NotificationRecipients } from './send-input'

export type SendNotification = (db: Db, to: NotificationRecipients, message: PushMessage) => Promise<void>

/**
 * Sends `message` to users or to devices as a background job, enqueued in `db`'s transaction when it is one, so it
 * goes out only once that commits. A user send says whether it shows in the users' inbox: then each user's history
 * keeps it, and either way it is pushed to their devices as they are when the job runs; a device send is only pushed.
 * The send is checked before anything is enqueued (see `checkedSend`), and authorizes nothing: who gets what is the
 * caller's to decide.
 */
export const sendNotification: SendNotification = async (db, to, message) => {
  const send = checkedSend(to, message)
  const job = currentJobs().definition(pushJobName)
  if (!job) throw new Error('Notifications are off: add extends: [notifications()] to protobase.config.ts to send them')
  await job.enqueue(db, send)
}
