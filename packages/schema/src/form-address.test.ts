import { describe, expect, it } from 'vitest'
import { readAppPath } from './app-address'
import { formPath, formRoute, readFormAddress } from './form-address'

describe('form addresses', () => {
  it('puts a form under the app pages, where no resource or page can take its place', () => {
    expect(formPath('contact')).toBe('/-/forms/contact')
    expect(readFormAddress(formPath('call-back'))).toEqual({ name: 'call-back' })
    expect(readAppPath(formPath('contact'), new Set(['forms']))).toBeUndefined()
  })

  it('reads nothing else as a form', () => {
    for (const path of [formRoute, `${formRoute}/`, '/forms/contact', `${formRoute}/contact/extra`, `${formRoute}/Contact`, `${formRoute}/a%20b`, '/-/sign-in']) {
      expect(readFormAddress(path), path).toBeUndefined()
    }
  })
})
