import { afterEach, describe, expect, it, vi } from 'vitest'
import { authLogger } from './auth-logger'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('authLogger', () => {
  it("leaves out Better Auth's reports on the store's schema, which advise npx auth migrate", () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    authLogger.log!('error', 'Database schema mismatch\n\n  Missing tables\n    user\n\n  help: Run `npx auth migrate` to add the missing tables and columns.')
    authLogger.log!('error', 'Could not validate the database schema. Check your database connection.')
    expect(error).not.toHaveBeenCalled()
  })

  it('prints every other message', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    authLogger.log!('error', 'Failed to verify the passkey', 'cause')
    authLogger.log!('warn', 'your BETTER_AUTH_SECRET appears low-entropy')
    expect(error).toHaveBeenCalledWith(expect.stringContaining('Failed to verify the passkey'), 'cause')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('low-entropy'))
  })
})
