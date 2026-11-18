import { describe, expect, it, vi } from 'vitest'
import { removeStartScreen, snapshotPlaceholder, startScreenHandOff, startScreenId, startsFromSnapshot } from './start-screen'

describe('the start screen', () => {
  it('hands off, then goes from the page', () => {
    const calls: string[] = []
    const dispatchEvent = vi.fn((event: Event) => calls.push(event.type) > 0)
    const remove = vi.fn(() => calls.push('remove'))
    const getElementById = vi.fn(() => ({ dispatchEvent, remove }) as unknown as HTMLElement)
    removeStartScreen({ getElementById })
    expect(getElementById).toHaveBeenCalledWith(startScreenId)
    expect(calls).toEqual([startScreenHandOff, 'remove'])
  })

  it('leaves a page without one as it is', () => {
    expect(() => removeStartScreen({ getElementById: () => null })).not.toThrow()
  })

  it("starts from a host's snapshot only when its placeholder holds something", () => {
    const at = (nodes: number | undefined) => ({ getElementById: (id: string) => (id === 'pb-snapshot' && nodes !== undefined ? ({ childNodes: { length: nodes } } as unknown as HTMLElement) : null) })
    expect(startsFromSnapshot(at(3))).toBe(true)
    expect(startsFromSnapshot(at(0))).toBe(false)
    expect(startsFromSnapshot(at(undefined))).toBe(false)
    expect(snapshotPlaceholder).toBe('<div id="pb-snapshot"></div>')
  })
})
