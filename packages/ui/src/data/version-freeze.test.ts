import { describe, expect, it } from 'vitest'
import type { MetaData } from './meta-data'
import { keepOnVersionChange } from './version-freeze'

const meta = (protobaseVersion: string | undefined, appName = 'Shop'): MetaData => ({
  etag: `"${appName}-${protobaseVersion}"`,
  appName,
  ...(protobaseVersion && { protobaseVersion }),
  resources: {},
  views: {},
  pages: {},
  permissions: {},
})

describe('keepOnVersionChange', () => {
  it('takes the first /meta as it is', () => {
    const first = meta('0.14.2')
    expect(keepOnVersionChange(undefined, first)).toBe(first)
  })

  it('takes a newer /meta from the same version', () => {
    const next = meta('0.14.2', 'Store')
    expect(keepOnVersionChange(meta('0.14.2'), next)).toBe(next)
  })

  it('keeps the /meta it has when the version moves, marked with the new one', () => {
    const previous = meta('0.14.2')
    expect(keepOnVersionChange(previous, meta('0.14.3', 'Store'))).toEqual({ ...previous, versionChange: { to: '0.14.3' } })
  })

  it('counts any difference, a step back too', () => {
    expect(keepOnVersionChange(meta('1.2.0'), meta('1.1.9')).versionChange).toEqual({ to: '1.1.9' })
  })

  it('counts a server that starts or stops naming its version', () => {
    expect(keepOnVersionChange(meta(undefined), meta('0.15.0')).versionChange).toEqual({ to: '0.15.0' })
    expect(keepOnVersionChange(meta('0.15.0'), meta(undefined)).versionChange).toEqual({})
  })

  it('stays frozen once the version has moved, also when the server goes back', () => {
    const frozen = keepOnVersionChange(meta('0.14.2'), meta('0.14.3'))
    expect(keepOnVersionChange(frozen, meta('0.14.2', 'Store'))).toBe(frozen)
  })
})
