import { describe, expect, it } from 'vitest'
import { frameCursor } from './frame-cursor'

describe('frameCursor', () => {
  it('reads on after the newest id, asking again for the ids it skipped', () => {
    const cursor = frameCursor(10n)
    cursor.read([11n, 14n])
    expect(cursor.next()).toEqual({ after: 14n, gaps: [13n, 12n] })
    cursor.read([12n, 15n])
    expect(cursor.next()).toEqual({ after: 15n, gaps: [13n] })
  })

  it('gives up an id after two seconds', () => {
    let at = 0
    const cursor = frameCursor(0n, [], () => at)
    cursor.read([2n])
    at = 2001
    cursor.read([])
    expect(cursor.next()).toEqual({ after: 2n, gaps: [] })
  })

  it('takes the ids below the newest a snapshot did not see as gaps', () => {
    const cursor = frameCursor(9n, [5n, 7n, 9n])
    expect(cursor.next()).toEqual({ after: 9n, gaps: [8n, 6n] })
  })

  it('asks for at most a thousand ids again', () => {
    const cursor = frameCursor(0n)
    cursor.read([5000n])
    expect(cursor.next().gaps).toHaveLength(1000)
    expect(cursor.next().gaps[0]).toBe(4999n)
  })
})
