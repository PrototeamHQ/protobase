import { describe, expect, it } from 'vitest'
import { frameBox, nextFrameHeight, type FrameHeight } from './frame-height'

// The reports of a page `extra` pixels taller than its frame's viewport, each after the frame took the last height.
const reportsOfViewportPage = (extra: number, times: number) => {
  let size: FrameHeight | undefined
  let viewport = 432
  for (let i = 0; i < times; i++) {
    size = nextFrameHeight(size, viewport + extra, viewport)
    if (size.kind === 'fixed') return size
    viewport = size.height
  }
  return size
}

describe('nextFrameHeight', () => {
  it('settles a page sized by the viewport at a fixed height', () => {
    expect(reportsOfViewportPage(16, 10)).toEqual({ kind: 'fixed' })
    expect(reportsOfViewportPage(0.5, 10)).toEqual({ kind: 'fixed' })
    expect(nextFrameHeight({ kind: 'fixed' }, 2000, 432)).toEqual({ kind: 'fixed' })
  })

  it('keeps the measured height of ordinary content', () => {
    const first = nextFrameHeight(undefined, 1200, 432)
    expect(first).toEqual({ kind: 'measured', height: 1200, viewport: 432 })
    // An image loaded after the frame took the page's height.
    expect(nextFrameHeight(first, 1500, 1200)).toEqual({ kind: 'measured', height: 1500, viewport: 1200 })
    // The page changed while the frame kept its height.
    expect(nextFrameHeight(first, 1216, 432)).toEqual({ kind: 'measured', height: 1216, viewport: 432 })
  })
})

describe('frameBox', () => {
  it('is as tall as a measured page', () => {
    expect(frameBox({ kind: 'measured', height: 640, viewport: 432 })).toEqual({ style: { height: 640 } })
  })

  it('keeps its minimum height while unmeasured, for a page 0 tall, and for a page sized by the frame', () => {
    for (const size of [undefined, { kind: 'measured', height: 0, viewport: 432 } as const, { kind: 'fixed' } as const]) {
      expect(frameBox(size)).toEqual({ className: 'min-h-[60vh]' })
    }
  })
})
