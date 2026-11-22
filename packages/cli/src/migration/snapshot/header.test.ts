import { describe, expect, it } from 'vitest'
import { headerText, parseHeader } from './header'

const header = { id: 'abc', version: '1.0.0', steps: { auth: 5, passkeys: 2 }, model: 'f00', organizationsEverOn: true, custom: true, additive: true }

describe('the header of a migration Protobase wrote', () => {
  it('reads back what it wrote', () => {
    expect(parseHeader(`${headerText(header)}\n-- a comment\ncreate table t ();\n`)).toEqual(header)
    expect(parseHeader(`${headerText({ ...header, steps: {}, organizationsEverOn: false, custom: false, additive: false })}\n`)).toEqual({ ...header, steps: {}, organizationsEverOn: false, custom: false, additive: false })
  })

  it('is no header without the id first, nor below other lines', () => {
    expect(parseHeader('create table t ();\n')).toBeUndefined()
    expect(parseHeader('-- a comment\n-- protobase:id abc\n')).toBeUndefined()
  })
})
