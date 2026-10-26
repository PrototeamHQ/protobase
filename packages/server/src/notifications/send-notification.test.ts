import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearCurrentJobs, setCurrentJobs, type JobsEnqueuer } from '../jobs/current'
import { defineJob } from '../jobs/define-job'
import { pushJobName } from './push-job-name'
import { sendNotification } from './send-notification'
import { NotificationSendError } from './send-input'

const db = { isTransaction: true } as never

let runtime: JobsEnqueuer | undefined

const running = (names: string[]) => {
  const enqueue = vi.fn(async () => 'job-id')
  const definitions = new Map(names.map((name) => [name, defineJob({ name, run: () => {} })]))
  runtime = { enqueue, wake: () => {}, definition: (name) => definitions.get(name) }
  setCurrentJobs(runtime)
  return enqueue
}

afterEach(() => {
  if (runtime) clearCurrentJobs(runtime)
  runtime = undefined
})

describe('sendNotification', () => {
  it("enqueues the checked send as the app's notifications job, in the caller's database handle", async () => {
    const enqueue = running([pushJobName])
    await sendNotification(db, { userIds: ['a', 'a'], inbox: true }, { title: 'Hi', url: 'https://App.example/x' })
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ name: pushJobName }), db, { to: { userIds: ['a'], inbox: true }, message: { title: 'Hi', url: 'https://app.example/x' } }, undefined)
  })

  it('refuses an invalid send before anything is enqueued', async () => {
    const enqueue = running([pushJobName])
    await expect(sendNotification(db, { userIds: ['a'] } as never, { title: 'Hi' })).rejects.toBeInstanceOf(NotificationSendError)
    await expect(sendNotification(db, { deviceIds: ['d'] }, { title: 'Hi', url: 'javascript:alert(1)' })).rejects.toBeInstanceOf(NotificationSendError)
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('says notifications are off when the app has none', async () => {
    running(['other'])
    await expect(sendNotification(db, { deviceIds: ['d'] }, { title: 'Hi' })).rejects.toThrow('Notifications are off: add notifications: {}')
  })
})
