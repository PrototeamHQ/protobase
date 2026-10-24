import { describe, expect, it } from 'vitest'
import { StaleJobError } from '../jobs/job-progress'
import { NotificationStoreError, storeCall } from './store-call'

describe('storeCall', () => {
  it('replaces what a store throws with an error naming the method and at most its SQLSTATE', async () => {
    const leak = Object.assign(new Error('token secret-token'), { detail: 'Key (token)=(secret-token)', code: '23505', cause: new Error('secret-token') })
    const thrown = (await storeCall('removeGone', () => Promise.reject(leak)).catch((error: unknown) => error)) as NotificationStoreError
    expect(thrown).toBeInstanceOf(NotificationStoreError)
    expect(thrown.message).toBe("The notifications store's removeGone failed (23505)")
    expect(thrown.cause).toBeUndefined()
    const odd = (await storeCall('record', () => Promise.reject(Object.assign(new Error('x'), { code: 'secret-token' }))).catch((error: unknown) => error)) as Error
    expect(odd.message).toBe("The notifications store's record failed")
  })

  it('lets a stale try stop as it is', async () => {
    await expect(storeCall('record', () => Promise.reject(new StaleJobError('notifications.send')))).rejects.toBeInstanceOf(StaleJobError)
  })
})
