import { describe, expect, it, vi } from 'vitest'
import { enterAfterUpdate } from './enter-after-update'

describe('enterAfterUpdate', () => {
  it('enters after an update that did not reload, or without one', async () => {
    const enter = vi.fn(async () => {})
    await enterAfterUpdate(async () => false, enter)
    await enterAfterUpdate(undefined, enter)
    expect(enter).toHaveBeenCalledTimes(2)
  })

  it('leaves entering to the page an update reloaded', async () => {
    const enter = vi.fn(async () => {})
    await enterAfterUpdate(async () => true, enter)
    expect(enter).not.toHaveBeenCalled()
  })

  it('enters when the update fails, then throws its error', async () => {
    const enter = vi.fn(async () => {})
    await expect(
      enterAfterUpdate(async () => {
        throw new RangeError('bug')
      }, enter),
    ).rejects.toThrow('bug')
    expect(enter).toHaveBeenCalledTimes(1)
  })
})
