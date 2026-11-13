import { describe, expect, it } from 'vitest'
import { swapDecision } from './swap-decision'

const answer = (bundleId: string | null, required = false) => ({ bundleId, url: bundleId && `https://shop.example.com/api/mobile/releases/${bundleId}`, required })
const at = { current: null, next: null }

describe('swapDecision', () => {
  it('takes a release the app does not have, for its next cold start', () => {
    expect(swapDecision({ ...at, answer: answer('b') })).toEqual({ kind: 'take', bundleId: 'b' })
    expect(swapDecision({ ...at, current: 'a', next: 'a', answer: answer('b') })).toEqual({ kind: 'take', bundleId: 'b' })
  })

  it('changes nothing for the release the app runs or runs next', () => {
    expect(swapDecision({ ...at, current: 'b', next: 'b', answer: answer('b') })).toEqual({ kind: 'none' })
    expect(swapDecision({ ...at, next: 'b', answer: answer('b') })).toEqual({ kind: 'none' })
  })

  it('skips a required release, which is for another shell version than the binary takes', () => {
    expect(swapDecision({ ...at, answer: answer('b', true) })).toEqual({ kind: 'none' })
    expect(swapDecision({ ...at, current: 'a', next: 'a', answer: answer('b', true) })).toEqual({ kind: 'none' })
  })

  it('never goes back to the built-in files, whatever the answer', () => {
    expect(swapDecision({ ...at, current: 'a', next: 'a', answer: answer(null) })).toEqual({ kind: 'none' })
    expect(swapDecision({ ...at, current: 'a', next: 'a', answer: answer(null, true) })).toEqual({ kind: 'none' })
    expect(swapDecision({ ...at, current: 'a', next: 'a', answer: undefined })).toEqual({ kind: 'none' })
  })
})
