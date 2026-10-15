import { describe, expect, it } from 'vitest'
import { readAppName } from './app-name'

describe('readAppName', () => {
  it('reads the trimmed name, and none when it is unset or blank', () => {
    expect(readAppName({ PROTOBASE_APP_NAME: ' Property Finder ' })).toBe('Property Finder')
    expect(readAppName({ PROTOBASE_APP_NAME: '  ' })).toBeUndefined()
    expect(readAppName({})).toBeUndefined()
  })
})
