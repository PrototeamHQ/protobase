import { describe, expect, it } from 'vitest'
import { barIdOf, barIn } from './bar-identity'
import { timelineShape, type TimelineFields } from './timeline-layout'

const fields: TimelineFields = { lane: 'project', bar: 'task', start: 'from', end: 'to', color: 'phase' }
const t0 = Date.parse('2026-11-14T00:00:00Z')
const hour = 3_600_000
const record = (project: string | null, task: number, from: number, to: number) => ({ project, task, phase: 'build', from: new Date(t0 + from * hour).toISOString(), to: new Date(t0 + to * hour).toISOString() })

describe('barIn', () => {
  it('finds a bar again in a newer shape, with the times the new data gives it', () => {
    const before = timelineShape([record('web', 1, 0, 2), record('api', 1, 1, 3)], fields, t0)
    const id = barIdOf(before.lanes[0]!.rows[0]![0]!)
    const after = timelineShape([record('web', 1, 0, 5), record('api', 1, 1, 3)], fields, t0)
    expect(barIn(after, id)).toMatchObject({ key: '1', lane: 'web', end: t0 + 5 * hour })
  })

  it('tells a bar of a lane without a value, and gives none once the bar or its lane is gone', () => {
    const shape = timelineShape([record(null, 2, 0, 1), record('web', 1, 0, 2)], fields, t0)
    expect(barIn(shape, barIdOf(shape.lanes[0]!.rows[0]![0]!))).toMatchObject({ key: '2', lane: null })
    expect(barIn(shape, { lane: 'web', bar: '2' })).toBeNull()
    expect(barIn(shape, { lane: 'docs', bar: '1' })).toBeNull()
    expect(barIn(shape, null)).toBeNull()
  })
})
