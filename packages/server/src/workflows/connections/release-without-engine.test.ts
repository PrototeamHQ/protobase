import { describe, expect, it, vi } from 'vitest'
import type { ConnectionListener } from '../../better-auth/connections/connection-events'
import { releaseConnectionsWithUsers } from './release-without-engine'

// An auth instance as far as the listener reads it: its declared connections and where the listener goes.
const authWith = (declared: unknown[]) => {
  const set = vi.fn((_listener: ConnectionListener) => {})
  return { auth: { connections: { declared, events: { set }, revokeSealed: async () => 'revoked' as const } } as never, set }
}

describe('releasing connections without the workflow engine', () => {
  it('listens for a deleted user only, refusing what only the served app does', async () => {
    const { auth, set } = authWith([{ key: 'acme:account' }])
    const report = vi.fn()
    releaseConnectionsWithUsers(auth, {}, { db: {} as never, report })
    const listener = set.mock.calls[0]![0]
    await expect(listener.linked('acc-1')).rejects.toThrow('Not implemented')
    await expect(listener.uses('ada', ['acc-1'])).rejects.toThrow('Not implemented')
    listener.unrevoked({ provider: 'workflow-acme-account', reason: 'queue_failed' })
    expect(report.mock.calls[0]![0].message).toBe("A disconnected account's token of workflow-acme-account is not revoked: queue_failed")
  })

  it('sets nothing for an app whose workflows declare no connection', () => {
    const { auth, set } = authWith([])
    releaseConnectionsWithUsers(auth, {}, { db: {} as never, report: () => {} })
    expect(set).not.toHaveBeenCalled()
  })
})
