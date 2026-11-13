import { describe, expect, it } from 'vitest'
import { isRuntimeCommand } from './start'

describe('isRuntimeCommand', () => {
  it('passes the serve runtime its own commands and launches otherwise', () => {
    expect(['serve', 'migrate', 'create-admin'].every(isRuntimeCommand)).toBe(true)
    expect(isRuntimeCommand(undefined)).toBe(false)
    expect(isRuntimeCommand('--help')).toBe(false)
  })
})
