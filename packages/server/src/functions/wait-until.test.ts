import { afterEach, describe, expect, it, vi } from 'vitest'
import { backgroundSettled, waitUntil } from './wait-until'

afterEach(() => vi.restoreAllMocks())

describe('waitUntil', () => {
  it('settles once all work has, including work started by work', async () => {
    const done: string[] = []
    waitUntil(new Promise((resolve) => setTimeout(() => {
      done.push('first')
      waitUntil(new Promise((inner) => setTimeout(() => inner(done.push('second')), 5)))
      resolve(undefined)
    }, 5)))
    await backgroundSettled()
    expect(done).toEqual(['first', 'second'])
  })

  it('prints a rejection instead of failing the wait', async () => {
    const printed = vi.spyOn(console, 'error').mockImplementation(() => {})
    waitUntil(Promise.reject(new Error('mail server down')))
    await backgroundSettled()
    expect(printed).toHaveBeenCalledWith(new Error('mail server down'))
  })

  it('resolves at once with nothing pending', async () => {
    await expect(backgroundSettled()).resolves.toBeUndefined()
  })
})
