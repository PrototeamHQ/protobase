import { describe, expect, it } from 'vitest'
import type { BreakNode } from './data-graph'
import { breakId, makeId } from './pure-ids'
import { localsLeft } from './use-pins'

const broken = (source: string, path: string[]): BreakNode => ({ kind: 'break', id: breakId(source, path), source, path, type: { kinds: ['object'] }, outputs: [] })

describe('localsLeft', () => {
  it('drops a removed Break made on the canvas and each Break made from its fields, and keeps the others', () => {
    const local = [
      { kind: 'break' as const, source: 'Fetch', path: ['body'] },
      { kind: 'break' as const, source: 'Fetch', path: ['body', 'owner'] },
      { kind: 'break' as const, source: 'Fetch', path: ['headers'] },
      { kind: 'make' as const, target: 'Save', key: 'data' },
    ]
    expect(localsLeft(local, [broken('Fetch', ['body'])])).toEqual([local[2], local[3]])
    expect(localsLeft(local, [{ kind: 'make', id: makeId('Save', 'data'), target: 'Save', key: 'data', type: { kinds: ['object'] }, inputs: [] }])).toEqual(local.slice(0, 3))
  })
})
