import { describe, expect, it, vi } from 'vitest'
import { bothAccountHooks } from './connection-account-hooks'

type Before = (record: never, context: never) => Promise<unknown>

describe('bothAccountHooks', () => {
  it('runs both, the second on the data the first returns, and returns both their data', async () => {
    const second = vi.fn(async () => ({ data: { scope: 'openid' } }))
    const joined = bothAccountHooks({ create: { before: async () => ({ data: { singleSubjectUserId: 'user-1' } }) } }, { create: { before: second } })
    const result = await (joined.create!.before as Before)({ providerId: 'central' } as never, null as never)
    expect(second).toHaveBeenCalledWith({ providerId: 'central', singleSubjectUserId: 'user-1' }, null)
    expect(result).toEqual({ data: { singleSubjectUserId: 'user-1', scope: 'openid' } })
  })

  it("passes the record on as it is, and answers the second's result, when the first returns no data", async () => {
    const joined = bothAccountHooks({ create: { before: async () => undefined } }, { create: { before: async () => false } })
    expect(await (joined.create!.before as Before)({ providerId: 'github' } as never, null as never)).toBe(false)
  })
})
