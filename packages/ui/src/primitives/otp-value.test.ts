import { describe, expect, it } from 'vitest'
import { editedCode, pastedCode } from './otp-value'

describe('editedCode', () => {
  it('keeps digits only, and no more than the code has', () => {
    expect(editedCode('12a3', 'a', 6)).toBe('123')
    expect(editedCode('1234567', '7', 6)).toBe('123456')
  })

  it('takes a whole code inserted in one go, whatever the field held, as autofill and suggestions insert it', () => {
    expect(editedCode('12482913', '482913', 6)).toBe('482913')
    expect(editedCode('12482 913', '482 913', 6)).toBe('482913')
  })

  it('keeps the field when the inserted text holds fewer digits than a code', () => {
    expect(editedCode('12345', '45', 6)).toBe('12345')
    expect(editedCode('', null, 6)).toBe('')
  })
})

describe('pastedCode', () => {
  it('replaces the field with a whole code, from any text around it', () => {
    expect(pastedCode('12', 'Your code: 482-913.', 2, 6)).toBe('482913')
    expect(pastedCode('', '4829131', 0, 6)).toBe('482913')
  })

  it('fills the boxes from the selected one with fewer digits, over what they held', () => {
    expect(pastedCode('120056', '34', 2, 6)).toBe('123456')
    expect(pastedCode('129456', '3', 2, 6)).toBe('123456')
    expect(pastedCode('12', '34', 2, 6)).toBe('1234')
    expect(pastedCode('12345', '678', 5, 6)).toBe('123456')
  })
})
