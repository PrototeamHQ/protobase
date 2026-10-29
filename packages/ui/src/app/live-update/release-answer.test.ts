import { describe, expect, it } from 'vitest'
import { releaseAnswerOf } from './release-answer'

describe('releaseAnswerOf', () => {
  it('takes the answer, and ignores a field a later server adds', () => {
    expect(releaseAnswerOf({ bundleId: 'abc_1-2', url: 'https://shop.example.com/api/mobile/releases/abc_1-2', required: false, more: 1 })).toEqual({
      bundleId: 'abc_1-2',
      url: 'https://shop.example.com/api/mobile/releases/abc_1-2',
      required: false,
    })
    expect(releaseAnswerOf({ bundleId: null, url: null, required: true })).toEqual({ bundleId: null, url: null, required: true })
  })

  it('is none for a body that is not the answer', () => {
    for (const body of [null, 'x', [], {}, { bundleId: 'a', url: null }, { bundleId: 1, url: null, required: false }, { bundleId: 'a', url: 2, required: false }, { bundleId: 'a', url: null, required: 'no' }]) {
      expect(releaseAnswerOf(body), JSON.stringify(body)).toBeUndefined()
    }
  })

  it('is none for an id that is not one safe path component', () => {
    for (const bundleId of ['', '..', 'a/b', 'a%2fb', 'a.b', 'x'.repeat(65)]) {
      expect(releaseAnswerOf({ bundleId, url: null, required: false }), bundleId).toBeUndefined()
    }
  })
})
