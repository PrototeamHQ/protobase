import { describe, expect, it, vi } from 'vitest'
import { removeStartScreen, startScreenId } from './start-screen'

describe('the start screen', () => {
  it('goes from the page', () => {
    const remove = vi.fn()
    const getElementById = vi.fn(() => ({ remove }) as unknown as HTMLElement)
    removeStartScreen({ getElementById })
    expect(getElementById).toHaveBeenCalledWith(startScreenId)
    expect(remove).toHaveBeenCalledOnce()
  })

  it('leaves a page without one as it is', () => {
    expect(() => removeStartScreen({ getElementById: () => null })).not.toThrow()
  })
})
