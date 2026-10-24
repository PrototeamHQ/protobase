import { describe, expect, it } from 'vitest'
import { appNameOver, readAppName, shownAppName } from './app-name'

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

describe('shownAppName', () => {
  it("is the auth's name, else the platform's, else the default", () => {
    expect(shownAppName({ appName: 'Shop' }, { PROTOBASE_APP_NAME: 'mobile-lab' })).toBe('Shop')
    expect(shownAppName(undefined, { PROTOBASE_APP_NAME: 'mobile-lab' })).toBe('mobile-lab')
    expect(shownAppName({}, {})).toBe('Protobase')
  })
})
