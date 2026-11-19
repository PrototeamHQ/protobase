import { describe, expect, it, vi } from 'vitest'
import { removeStartScreen, startScreenHandOff, startScreenId } from './start-screen'

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
})
