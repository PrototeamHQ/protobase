import { describe, expect, it } from 'vitest'
import { resolveSignUpFields } from './sign-up-fields'

describe('resolveSignUpFields', () => {
  it('asks for the address and the name by default', () => {
    expect(resolveSignUpFields(undefined)).toEqual(['email', 'name'])
  })

  it('asks for the address only, or for both in a fixed order', () => {
    expect(resolveSignUpFields(['email'])).toEqual(['email'])
    expect(resolveSignUpFields(['name', 'email', 'name'])).toEqual(['email', 'name'])
  })

  it('refuses a list without the address, and a field it does not know', () => {
    expect(() => resolveSignUpFields(['name'])).toThrow("signUp.fields needs 'email'")
    expect(() => resolveSignUpFields([])).toThrow("signUp.fields needs 'email'")
    expect(() => resolveSignUpFields(['email', 'phone'])).toThrow('signUp.fields takes email and name, not "phone"')
  })
})
