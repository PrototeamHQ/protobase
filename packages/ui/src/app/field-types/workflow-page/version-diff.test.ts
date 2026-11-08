import { describe, expect, it } from 'vitest'
import type { Definition } from '@protobase/workflows'
import { versionDiff } from './version-diff'

const of = (States: Record<string, unknown>) => ({ trigger: { manual: {} }, stateMachine: { QueryLanguage: 'JSONata', StartAt: 'A', States } }) as unknown as Definition

describe('versionDiff', () => {
  it('counts changed, added and removed steps by name, the ones in a Map too', () => {
    const from = of({ A: { Type: 'Pass', End: true }, B: { Type: 'Wait', Seconds: 1, End: true }, M: { Type: 'Map', Items: [], End: true, ItemProcessor: { StartAt: 'In', States: { In: { Type: 'Succeed' } } } } })
    const to = of({ A: { Type: 'Pass', Next: 'C' }, C: { Type: 'Succeed' }, M: { Type: 'Map', Items: [], End: true, ItemProcessor: { StartAt: 'In', States: { In: { Type: 'Succeed' } } } } })
    expect(versionDiff(from, to)).toEqual({ changed: 1, added: 1, removed: 1 })
  })

  it('counts a change inside a Map once, as the step changed, not the Map too', () => {
    const map = (Seconds: number) => of({ M: { Type: 'Map', Items: [], End: true, ItemProcessor: { StartAt: 'In', States: { In: { Type: 'Wait', Seconds, End: true } } } } })
    expect(versionDiff(map(1), map(2))).toEqual({ changed: 1, added: 0, removed: 0 })
  })
})
