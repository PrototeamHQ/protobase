import { describe, expect, it, vi } from 'vitest'
import type { Db } from '@protobase/query'
import { pageNotices } from './page-notices'
import { liveRefresh } from './refresh/live-refresh'

const db = {} as Db

describe('pageNotices', () => {
  it("tells a person's pages on the relay's people channel to read again, which gives them new live tokens", async () => {
    const tell = vi.fn(async () => {})
    const pages = pageNotices('changes', tell)
    await liveRefresh((userIds) => pages.refresh(db, userIds)).refresh({ user: 'u1' })
    expect(tell).toHaveBeenCalledWith(db, ['u1'], 'refresh')
  })

  it("tells a person's pages of their rings on the relay's people channel", async () => {
    const tell = vi.fn(async () => {})
    await pageNotices('changes', tell).rings(db, ['u1', 'u2'])
    expect(tell).toHaveBeenCalledWith(db, ['u1', 'u2'], 'rings')
  })
})
