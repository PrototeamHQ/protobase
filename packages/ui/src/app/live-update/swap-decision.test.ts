import { describe, expect, it } from 'vitest'
import { swapDecision } from './swap-decision'

const answer = (bundleId: string | null, required = false) => ({ bundleId, url: bundleId && `https://shop.example.com/api/mobile/releases/${bundleId}`, required })
const at = { current: null, next: null, launch: true }

describe('swapDecision', () => {
  it('downloads a release the app does not have and sets it next, for its next cold start', () => {
    expect(swapDecision({ ...at, answer: answer('b') })).toEqual({ kind: 'take', bundleId: 'b', download: true, reload: false })
    expect(swapDecision({ ...at, current: 'a', next: 'a', answer: answer('b'), launch: false })).toEqual({ kind: 'take', bundleId: 'b', download: true, reload: false })
  })

  it('changes nothing for the release the app runs or runs next', () => {
    expect(swapDecision({ ...at, current: 'b', next: 'b', answer: answer('b') })).toEqual({ kind: 'none' })
    expect(swapDecision({ ...at, next: 'b', answer: answer('b') })).toEqual({ kind: 'none' })
  })

  it('never goes back to the built-in files, whatever the answer', () => {
    expect(swapDecision({ ...at, current: 'a', next: 'a', answer: answer(null) })).toEqual({ kind: 'none' })
    expect(swapDecision({ ...at, current: 'a', next: 'a', answer: answer(null, true) })).toEqual({ kind: 'none' })
    expect(swapDecision({ ...at, current: 'a', next: 'a', answer: undefined })).toEqual({ kind: 'none' })
  })

  it('reloads into a required release at launch only, downloading it unless it is next already', () => {
    expect(swapDecision({ ...at, answer: answer('b', true) })).toEqual({ kind: 'take', bundleId: 'b', download: true, reload: true })
    expect(swapDecision({ ...at, next: 'b', answer: answer('b', true) })).toEqual({ kind: 'take', bundleId: 'b', download: false, reload: true })
    expect(swapDecision({ ...at, answer: answer('b', true), launch: false })).toEqual({ kind: 'take', bundleId: 'b', download: true, reload: false })
    expect(swapDecision({ ...at, current: 'b', answer: answer('b', true) })).toEqual({ kind: 'none' })
  })
})
