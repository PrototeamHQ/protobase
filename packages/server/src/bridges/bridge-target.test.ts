import { describe, expect, it } from 'vitest'
import { checkedTarget, defaultBridgeSeconds } from './bridge-target'

describe('checkedTarget', () => {
  it('takes a host and port, an hour by default', () => {
    expect(checkedTarget('db', { host: '10.0.0.5', port: 5432 })).toEqual({ host: '10.0.0.5', port: 5432, seconds: defaultBridgeSeconds })
    expect(checkedTarget('db', { host: 'db.internal', port: 5432, expiresInSeconds: 60 }).seconds).toBe(60)
  })

  it('refuses an answer the app got wrong, naming the target', () => {
    expect(() => checkedTarget('db', { host: '', port: 5432 })).toThrow('"db" has no host')
    expect(() => checkedTarget('db', { host: 'x', port: 0 })).toThrow('no port')
    expect(() => checkedTarget('db', { host: 'x', port: 65_536 })).toThrow('no port')
    expect(() => checkedTarget('db', { host: 'x', port: 1, expiresInSeconds: 86_401 })).toThrow('1 to 86400')
    expect(() => checkedTarget('db', { host: 'x', port: 1, expiresInSeconds: 1.5 })).toThrow('1 to 86400')
  })
})
