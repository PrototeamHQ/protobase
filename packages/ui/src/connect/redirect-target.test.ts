import { describe, expect, it } from 'vitest'
import { isSafeTarget, redirectTarget } from './redirect-target'

describe('where an allowed client gets its code', () => {
  it('is a site by its host, an international name in punycode', () => {
    expect(redirectTarget('https://chatgpt.com/connector/oauth/callback?x=1')).toEqual({ kind: 'site', host: 'chatgpt.com' })
    expect(redirectTarget('https://claude.ai:8443/cb')).toEqual({ kind: 'site', host: 'claude.ai:8443' })
    expect(redirectTarget('https://сlaude.ai/cb')).toEqual({ kind: 'site', host: 'xn--laude-0ye.ai' })
  })

  it('is this computer by its port, for a loopback address', () => {
    expect(redirectTarget('http://127.0.0.1:33418/callback')).toEqual({ kind: 'this-computer', port: '33418' })
    expect(redirectTarget('http://localhost:6274/oauth/callback')).toEqual({ kind: 'this-computer', port: '6274' })
    expect(redirectTarget('http://[::1]:5000/cb')).toEqual({ kind: 'this-computer', port: '5000' })
    expect(redirectTarget('http://localhost/cb')).toEqual({ kind: 'this-computer', port: '80' })
  })

  it('is an app on this device by its whole URI without the query, never only the host its scheme names', () => {
    expect(redirectTarget('x-any://claude.ai/cb')).toEqual({ kind: 'device-app', uri: 'x-any://claude.ai/cb' })
    expect(redirectTarget('cursor://anysphere.cursor-mcp/oauth/callback?state=1')).toEqual({ kind: 'device-app', uri: 'cursor://anysphere.cursor-mcp/oauth/callback' })
    expect(redirectTarget('com.example.app:/cb')).toEqual({ kind: 'device-app', uri: 'com.example.app:/cb' })
  })

  it('is nowhere for a scheme that runs in the page, plain http elsewhere, or nonsense', () => {
    for (const uri of ['javascript:alert(1)//', 'data:text/html,hi', 'vbscript:msgbox', 'file:///etc/passwd', 'http://evil.example/cb', 'not a uri']) expect(redirectTarget(uri), uri).toBeUndefined()
  })
})

describe('where the page may send the browser', () => {
  it('is anywhere but a scheme that runs or shows content in the page', () => {
    for (const url of ['/-/connect?sig=x', 'http://127.0.0.1:3000/cb?code=c', 'https://claude.ai/cb', 'cursor://x/cb']) expect(isSafeTarget(url), url).toBe(true)
    for (const url of ['javascript:alert(1)', 'JavaScript:alert(1)', 'data:text/html,x', 'vbscript:x']) expect(isSafeTarget(url), url).toBe(false)
  })
})
