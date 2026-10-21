import { describe, expect, it } from 'vitest'
import { appNameOver, readAppName } from './app-name'

describe('readAppName', () => {
  it('reads the trimmed name, and none when it is unset or blank', () => {
    expect(readAppName({ PROTOBASE_APP_NAME: ' Property Finder ' })).toBe('Property Finder')
    expect(readAppName({ PROTOBASE_APP_NAME: '  ' })).toBeUndefined()
    expect(readAppName({})).toBeUndefined()
  })
})

describe('appNameOver', () => {
  it("is the platform's name over the app's own, the app's own without it", () => {
    expect(appNameOver({ PROTOBASE_APP_NAME: 'Shop' }, 'Property Finder')).toBe('Shop')
    expect(appNameOver({ PROTOBASE_APP_NAME: ' ' }, 'Property Finder')).toBe('Property Finder')
    expect(appNameOver({}, undefined)).toBeUndefined()
  })
})
