import { describe, expect, it } from 'vitest'
import { nodeTraces, scopeItems, statePath, type TraceStep } from './run-trace'

const step = (scope: string, state: string, status: TraceStep['status'], next: string | null = null): TraceStep => ({ scope, state, status, next })

describe("a run's trace on the graph", () => {
  it("names a step's state by the Maps of its scope, their names decoded", () => {
    expect(statePath('', 'Fetch')).toBe('Fetch')
    expect(statePath('Each.3[0]/Inner%2FMap.1[4]', 'Mail')).toBe('Each/Inner/Map/Mail')
    expect(scopeItems('Each.3[0]/Inner%2FMap.1[4]')).toEqual([{ map: 'Each', index: 0 }, { map: 'Inner/Map', index: 4 }])
  })

  it('marks each state by its last step, the worst of its items, counting every try', () => {
    const traces = nodeTraces(
      [step('', 'Fetch', 'retrying'), step('', 'Fetch', 'succeeded', 'Each'), step('Each.1[0]', 'Mail', 'succeeded'), step('Each.1[1]', 'Mail', 'failed'), step('', 'Each', 'failed')],
      { inProgress: false, startAt: 'Fetch' },
    )
    expect(Object.fromEntries(traces)).toEqual({
      Fetch: { status: 'succeeded', steps: 2 },
      'Each/Mail': { status: 'failed', steps: 2 },
      Each: { status: 'failed', steps: 1 },
    })
  })

  it('marks the state a run goes on to while it runs, and the first one before anything ran', () => {
    expect(Object.fromEntries(nodeTraces([], { inProgress: true, startAt: 'Fetch' }))).toEqual({ Fetch: { status: 'current', steps: 0 } })
    const running = nodeTraces([step('', 'Fetch', 'succeeded', 'Store')], { inProgress: true, startAt: 'Fetch' })
    expect(running.get('Store')).toEqual({ status: 'current', steps: 0 })
    expect(nodeTraces([step('', 'Fetch', 'succeeded', 'Store')], { inProgress: false, startAt: 'Fetch' }).has('Store')).toBe(false)
  })
})
