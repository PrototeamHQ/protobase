import { describe, expect, it } from 'vitest'
import { updateAfterSignIn } from './sign-in-update'

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

  it('only takes the release without storage to keep the page', async () => {
    const { steps, updater } = setup()
    expect(await updateAfterSignIn(updater, undefined)).toBe(false)
    expect(steps).toEqual(['check'])
  })
})
