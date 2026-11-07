import { describe, expect, it } from 'vitest'
import { nativeTapGate } from './native-tap-gate'
import { nativeTapTarget } from './native-tap'

const api = 'https://mobile-lab.protobase.net'

describe('nativeTapGate', () => {
  it('holds a cold start\'s tap until the sign-in is known, then checks it as any other tap', () => {
    let userId: string | undefined
    const opened: unknown[] = []
    const gate = nativeTapGate((data) => opened.push(nativeTapTarget(data, { apiOrigin: api, userId, basePath: '' }) ?? 'nothing'))
    gate.tap({ user: 'alice', url: `${api}/tasks/1` })
    gate.tap({ user: 'alice', url: 'javascript:alert(1)' })
    gate.tap({ user: 'alice', url: 'https://mobile-lab.protobase.net@evil.com/x' })
    expect(opened).toEqual([])
    userId = 'alice'
    gate.settle(true)
    expect(opened).toEqual([{ kind: 'in-app', path: '/tasks/1' }, 'nothing', { kind: 'browser', url: 'https://mobile-lab.protobase.net@evil.com/x' }])
    gate.tap({ user: 'alice', url: `${api}/tasks/2` })
    expect(opened).toHaveLength(4)
  })

  it('opens nothing for a held tap when nobody turned out to be signed in', () => {
    const opened: unknown[] = []
    const gate = nativeTapGate((data) => opened.push(nativeTapTarget(data, { apiOrigin: api, userId: undefined, basePath: '' }) ?? 'nothing'))
    gate.tap({ user: 'alice', url: `${api}/tasks/1` })
    gate.settle(false)
    expect(opened).toEqual([])
    gate.settle(true)
    expect(opened).toEqual(['nothing'])
  })
})
