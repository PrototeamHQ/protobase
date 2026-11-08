import { describe, expect, it } from 'vitest'
import { barSize, panelOverlays } from './bar-size'

describe('barSize', () => {
  it('goes by the width the bar has', () => {
    expect([1232, 1100, 1099, 950, 949, 720, 719, 390].map(barSize)).toEqual(['wide', 'wide', 'medium', 'medium', 'narrow', 'narrow', 'compact', 'compact'])
  })
})

describe('panelOverlays', () => {
  it('lies over the surface once beside it would leave less than the least width, and not before anything is measured', () => {
    expect([1072, 860, 859, 692, 0].map((width) => panelOverlays(width))).toEqual([false, false, true, true, false])
  })

  it('counts both panels when both are open, and none when none is', () => {
    expect([panelOverlays(1240, 2), panelOverlays(1239, 2), panelOverlays(900, 2), panelOverlays(900, 0)]).toEqual([false, true, true, false])
  })
})
