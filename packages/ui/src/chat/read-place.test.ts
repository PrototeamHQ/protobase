import { describe, expect, it } from 'vitest'
import { readPlace } from './read-place'

// A box scrolled so its top is at 100, over children of the given tops and heights.
const box = { scrollTop: 0, scrollHeight: 2000, clientHeight: 400, getBoundingClientRect: () => ({ top: 100 }) }
const child = (name: string, top: number, height: number, divider = false) => ({
  name,
  hasAttribute: (attribute: string) => divider && attribute === 'data-chat-divider',
  getBoundingClientRect: () => ({ top, bottom: top + height }),
})
const place = (children: ReturnType<typeof child>[]) => readPlace(box, { children, firstElementChild: children[0] ?? null }, undefined)

describe('readPlace', () => {
  it('anchors on the first message whose bottom shows', () => {
    const anchor = place([child('m1', 0, 80), child('m2', 90, 80), child('m3', 180, 80)]).anchor
    expect(anchor?.element.name).toBe('m2')
    expect(anchor?.top).toBe(-10)
  })

  it('anchors on the message below a divider that shows first, since earlier messages of its day move the divider away', () => {
    const anchor = place([child('m1', 0, 80), child('day', 110, 20, true), child('m2', 140, 80)]).anchor
    expect(anchor?.element.name).toBe('m2')
    expect(anchor?.top).toBe(40)
  })

  it('anchors on the first message below the top when only dividers show', () => {
    const anchor = place([child('day', 100, 20, true), child('new', 130, 20, true), child('m1', 600, 80)]).anchor
    expect(anchor?.element.name).toBe('m1')
    expect(anchor?.top).toBe(500)
  })

  it('has no anchor without a message', () => {
    expect(place([child('day', 100, 20, true)]).anchor).toBeUndefined()
    expect(place([]).anchor).toBeUndefined()
  })
})
