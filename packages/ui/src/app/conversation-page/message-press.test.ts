import { describe, expect, it } from 'vitest'
import { nextPress, type Press, type PressEvent } from './message-press'

const run = (events: PressEvent[]) => {
  let press: Press
  const opened: boolean[] = []
  for (const event of events) {
    const next = nextPress(press, event)
    press = next.press
    opened.push(next.open)
  }
  return opened
}

const finger = { type: 'down', x: 100, y: 200, touch: true, onControl: false, typing: false } as const

describe('nextPress', () => {
  it('opens on a tap of a finger', () => {
    expect(run([finger, { type: 'tap' }])).toEqual([false, true])
  })

  it('opens on a long-press, and not again on the release that ends it', () => {
    expect(run([finger, { type: 'held' }, { type: 'tap' }])).toEqual([false, true, false])
  })

  it('opens on a tap whose click comes after the long-press time, once, and lowers the keyboard alone while typing', () => {
    expect(run([finger, { type: 'up' }, { type: 'held' }, { type: 'tap' }])).toEqual([false, false, false, true])
    expect(run([{ ...finger, typing: true }, { type: 'up' }, { type: 'held' }, { type: 'tap' }])).toEqual([false, false, false, false])
  })

  it('keeps a press that drifts within the slop', () => {
    expect(run([finger, { type: 'move', x: 106, y: 207 }, { type: 'held' }])).toEqual([false, false, true])
  })

  it('drops a press that moves away, as a scroll does', () => {
    expect(run([finger, { type: 'move', x: 100, y: 230 }, { type: 'held' }, { type: 'tap' }])).toEqual([false, false, false, false])
  })

  it('drops a press the browser takes over', () => {
    expect(run([finger, { type: 'cancel' }, { type: 'held' }])).toEqual([false, false, false])
  })

  it('only lowers the keyboard on a tap while the reader types, and still opens on a long-press', () => {
    expect(run([{ ...finger, typing: true }, { type: 'tap' }, { ...finger, typing: true }, { type: 'held' }])).toEqual([false, false, false, true])
  })

  it('leaves a mouse click to the hover bar', () => {
    expect(run([{ ...finger, touch: false }, { type: 'tap' }])).toEqual([false, false])
  })

  it('leaves a link or button of the message its own press', () => {
    expect(run([{ ...finger, onControl: true }, { type: 'tap' }, { ...finger, onControl: true }, { type: 'held' }])).toEqual([false, false, false, false])
  })
})
