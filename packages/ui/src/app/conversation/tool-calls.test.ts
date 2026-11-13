import { describe, expect, it } from 'vitest'
import { toolCallOf } from './tool-calls'

const fields = { name: 'tool', time: 'at', status: 'state', input: 'args', result: 'output', error: 'failure' }

describe('toolCallOf', () => {
  it('reads a call’s name, time, status, input, result and error, its status giving its mark', () => {
    const row = { tool: 'list_tasks', at: '2026-11-10T09:00:00Z', state: 'error', args: { state: 'open' }, output: null, failure: 'Locked' }
    expect(toolCallOf(row, 'call:1', fields)).toEqual({ kind: 'call', key: 'call:1', name: 'list_tasks', time: '2026-11-10T09:00:00Z', status: 'error', state: 'error', input: { state: 'open' }, error: 'Locked' })
  })

  it('gives each of done, error and running its mark, and any other status none', () => {
    const states = ['done', 'error', 'running', 'cancelled', null, ''].map((state) => toolCallOf({ tool: 'x', at: null, state }, 'call:1', fields).state)
    expect(states).toEqual(['done', 'error', 'running', undefined, undefined, undefined])
  })

  it('reads nothing of an input, result or error the thread does not name', () => {
    expect(toolCallOf({ tool: 'x', at: null, state: 'done', args: 1 }, 'call:1', { name: 'tool', time: 'at', status: 'state' })).toEqual({ kind: 'call', key: 'call:1', name: 'x', time: undefined, status: 'done', state: 'done' })
  })
})
