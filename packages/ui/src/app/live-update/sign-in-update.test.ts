import { afterEach, describe, expect, it, vi } from 'vitest'
import { signInUpdateLimitMs, updateAfterSignIn } from './sign-in-update'

afterEach(() => vi.useRealTimers())

// An updater whose check sets `next` and whose applyNext reloads into it unless `refuse`, recording each step.
const setup = ({ next = 'b' as string | null, refuse = false } = {}) => {
  const steps: string[] = []
  const updater = {
    check: async () => void steps.push('check'),
    applyNext: async (beforeReload: () => void) => {
      if (next === null) return false
      beforeReload()
      steps.push('reload')
      return !refuse
    },
  }
  const page = { keep: () => void steps.push('kept'), forget: () => void steps.push('forgotten') }
  return { steps, updater, page }
}

describe('updateAfterSignIn', () => {
  it('takes the release, then reloads into it on the page it shows', async () => {
    const { steps, updater, page } = setup()
    expect(await updateAfterSignIn(updater, page)).toBe(true)
    expect(steps).toEqual(['check', 'kept', 'reload'])
  })

  it('opens the app as it is when no release is set next', async () => {
    const { steps, updater, page } = setup({ next: null })
    expect(await updateAfterSignIn(updater, page)).toBe(false)
    expect(steps).toEqual(['check'])
  })

  it('forgets the page when the guard refuses the reload', async () => {
    const { steps, updater, page } = setup({ refuse: true })
    expect(await updateAfterSignIn(updater, page)).toBe(false)
    expect(steps).toEqual(['check', 'kept', 'reload', 'forgotten'])
  })

  it('opens the app once the limit passes, letting the download go on without reloading later', async () => {
    vi.useFakeTimers()
    const { steps, updater, page } = setup()
    let finish = () => {}
    const slow = { ...updater, check: () => new Promise<void>((resolve) => (finish = resolve)) }
    const done = updateAfterSignIn(slow, page)
    await vi.advanceTimersByTimeAsync(signInUpdateLimitMs)
    expect(await done).toBe(false)
    finish()
    await vi.runAllTimersAsync()
    expect(steps).toEqual([])
  })

  it('forgets the page when the reload fails, and throws what failed', async () => {
    const { steps, page } = setup()
    const failing = {
      check: async () => {},
      applyNext: async (beforeReload: () => void) => {
        beforeReload()
        throw new RangeError('bug')
      },
    }
    await expect(updateAfterSignIn(failing, page)).rejects.toThrow('bug')
    expect(steps).toEqual(['kept', 'forgotten'])
  })

  it('only takes the release without storage to keep the page', async () => {
    const { steps, updater } = setup()
    expect(await updateAfterSignIn(updater, undefined)).toBe(false)
    expect(steps).toEqual(['check'])
  })
})
