import { describe, expect, it } from 'vitest'
import { AuthError, NetworkError } from '@protobase/client'
import { runAction } from './use-action'

/** The states `runAction` sets, in order. */
const recorder = () => {
  const busy: boolean[] = []
  const errors: (string | undefined)[] = []
  return { busy, errors, state: { setBusy: (value: boolean) => void busy.push(value), setError: (value: string | undefined) => void errors.push(value) } }
}

describe('runAction', () => {
  it('is busy while the action runs and not after', async () => {
    const { busy, errors, state } = recorder()
    await runAction(async () => {
      expect(busy).toEqual([true])
    }, state)
    expect(busy).toEqual([true, false])
    expect(errors).toEqual([undefined])
  })

  it('says a network failure in words and is no longer busy', async () => {
    const { busy, errors, state } = recorder()
    await runAction(() => Promise.reject(new NetworkError()), state)
    expect(busy).toEqual([true, false])
    expect(errors.at(-1)).toBe('Could not reach the server. Try again.')
  })

  it('says the server refusal in words, as before', async () => {
    const { busy, errors, state } = recorder()
    await runAction(() => Promise.reject(new AuthError('Name taken', 400, 'SLUG_TAKEN')), state)
    expect(busy).toEqual([true, false])
    expect(errors.at(-1)).toBe('Name taken')
  })

  it('passes any other failure on, no longer busy', async () => {
    const { busy, state } = recorder()
    const bug = new Error('bug')
    await expect(runAction(() => Promise.reject(bug), state)).rejects.toBe(bug)
    expect(busy).toEqual([true, false])
  })
})
