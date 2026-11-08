import { describe, expect, it } from 'vitest'
import { nativeTapTarget, type NativeTapContext } from './native-tap'

const api = 'https://mobile-lab.protobase.net'
const context: NativeTapContext = { apiOrigin: api, userId: 'alice', basePath: '' }
const tap = (data: unknown, given: Partial<NativeTapContext> = {}) => nativeTapTarget(data, { ...context, ...given })
const push = (url: unknown, more: Record<string, unknown> = {}) => ({ user: 'alice', url, ...more })

describe('nativeTapTarget', () => {
  it("opens a url on the API's origin inside the app, by its path, query and hash", () => {
    expect(tap(push(`${api}/some-page?tab=2#notes`))).toEqual({ kind: 'in-app', path: '/some-page?tab=2#notes' })
    expect(tap(push(api))).toEqual({ kind: 'in-app', path: '/' })
  })

  it('opens a url on any other origin outside the app, never inside it', () => {
    expect(tap(push('https://elsewhere.example/x'))).toEqual({ kind: 'browser', url: 'https://elsewhere.example/x' })
    // User info, a look-alike host, another port and another scheme are each another origin.
    for (const url of ['https://mobile-lab.protobase.net@evil.com/x', 'https://mobile-lab.protobase.net.evil.com/x', 'https://mobile-lab.protobase.net:8443/x', 'http://mobile-lab.protobase.net/x']) {
      expect(tap(push(url))).toEqual({ kind: 'browser', url: new URL(url).href })
    }
  })

  it('opens nothing for a url that is no absolute http or https URL', () => {
    for (const url of ['javascript:alert(document.cookie)', 'data:text/html,<script>alert(1)</script>', '/some-page', '//evil.com/x', 'intent://x#Intent;end', 'content://app.example.provider/x', 'file:///data/x', `${api}/a\tb`, `${api}/a\n`, ` ${api}/a`, `${api}/\u0000`, '', 42, null]) {
      expect(tap(push(url))).toBeUndefined()
    }
    expect(tap({ user: 'alice' })).toBeUndefined()
    expect(tap(undefined)).toBeUndefined()
    expect(tap('https://elsewhere.example/x')).toBeUndefined()
  })

  it('reads the url key alone, never another one in its place', () => {
    expect(tap({ user: 'alice', data: { url: `${api}/x` }, link: `${api}/x`, navigate: `${api}/x` })).toBeUndefined()
    expect(tap({ user: 'alice', url: `${api}/mine`, data: 'https://evil.com/x', link: 'https://evil.com/x' })).toEqual({ kind: 'in-app', path: '/mine' })
    expect(tap({ user: 'alice', url: 'javascript:alert(1)', link: `${api}/x` })).toBeUndefined()
  })

  it('never hands the router a path it would read as another origin', () => {
    expect(tap(push(`${api}//evil.com/x`))).toBeUndefined()
    expect(tap(push(`${api}/\\evil.com/x`))).toBeUndefined()
    // An encoded slash stays encoded: a path of the app's own, whatever page it names.
    expect(tap(push(`${api}/%2F%2Fevil.com`))).toEqual({ kind: 'in-app', path: '/%2F%2Fevil.com' })
  })

  it('opens a page below the base path alone, by its path below it', () => {
    expect(tap(push(`${api}/admin/tasks/1?x=1`), { basePath: '/admin' })).toEqual({ kind: 'in-app', path: '/tasks/1?x=1' })
    expect(tap(push(`${api}/admin`), { basePath: '/admin' })).toEqual({ kind: 'in-app', path: '/' })
    expect(tap(push(`${api}/administrator`), { basePath: '/admin' })).toBeUndefined()
    expect(tap(push(`${api}/other`), { basePath: '/admin' })).toBeUndefined()
  })

  it('opens nothing for a push of another user, or with nobody signed in', () => {
    expect(tap(push(`${api}/x`, { user: 'bob' }))).toBeUndefined()
    expect(tap({ url: `${api}/x` })).toBeUndefined()
    expect(tap(push(`${api}/x`), { userId: undefined })).toBeUndefined()
    expect(tap(push('https://elsewhere.example/x'), { userId: undefined })).toBeUndefined()
  })
})
