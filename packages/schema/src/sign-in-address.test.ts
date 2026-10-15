import { describe, expect, it } from 'vitest'
import { readSignInAddress, signInPath, signInRoute } from './sign-in-address'

const read = (path: string) => {
  const url = new URL(path, 'http://local')
  return readSignInAddress(url.pathname, url.searchParams)
}

describe('signInPath', () => {
  it('writes the step and the page to come back to, leaving out the first step', () => {
    expect(signInPath()).toBe(signInRoute)
    expect(signInPath({ next: '/' })).toBe(signInRoute)
    expect(signInPath({ next: '/favorites' })).toBe('/-/sign-in?next=%2Ffavorites')
    expect(signInPath({ step: 'forgot-password', next: '/homes?filter=city%3DUtrecht' })).toBe('/-/sign-in?step=forgot-password&next=%2Fhomes%3Ffilter%3Dcity%253DUtrecht')
  })

  it('comes back to a page of this app only', () => {
    expect(signInPath({ next: 'https://evil.example/' })).toBe(signInRoute)
    expect(signInPath({ next: '//evil.example/' })).toBe(signInRoute)
    expect(signInPath({ next: '/\\evil.example/' })).toBe(signInRoute)
    expect(signInPath({ next: '/-/sign-in?step=sign-up' })).toBe(signInRoute)
  })
})

describe('readSignInAddress', () => {
  it('reads what signInPath writes', () => {
    expect(read(signInPath({ step: 'sign-up', next: '/homes?filter=city%3DUtrecht' }))).toEqual({ step: 'sign-up', next: '/homes?filter=city%3DUtrecht' })
    expect(read(signInPath())).toEqual({ step: 'sign-in' })
  })

  it('is the first step for a step it does not know, and has no page to come back to outside this app', () => {
    expect(read('/-/sign-in?step=elsewhere&next=https%3A%2F%2Fevil.example%2F')).toEqual({ step: 'sign-in' })
  })

  it('is undefined on any other path', () => {
    expect(read('/favorites?step=sign-up')).toBeUndefined()
  })
})
