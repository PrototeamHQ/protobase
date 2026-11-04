import { describe, expect, it } from 'vitest'
import type { ScopeOutcome } from './context'
import { fanOut } from './fan-out'

describe('fanOut', () => {
  it('starts no more scopes once one throws, and throws only after the running ones settled', async () => {
    const events: string[] = []
    let release = () => undefined as void
    const slow = new Promise<void>((resolve) => (release = resolve))
    const scopes = [
      async (): Promise<ScopeOutcome> => {
        await slow
        events.push('slow settled')
        return { kind: 'ended', output: 1 }
      },
      async (): Promise<ScopeOutcome> => {
        events.push('thrown')
        throw new Error('superseded')
      },
      async (): Promise<ScopeOutcome> => {
        events.push('started after the throw')
        return { kind: 'ended', output: 3 }
      },
    ]
    const running = fanOut(scopes, 2).catch((error: unknown) => {
      events.push('rejected')
      return error
    })
    await Promise.resolve()
    release()
    expect(await running).toEqual(new Error('superseded'))
    expect(events).toEqual(['thrown', 'slow settled', 'rejected'])
  })
})
