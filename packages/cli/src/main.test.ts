import { describe, expect, it } from 'vitest'
import { program } from './main'
import { protobaseVersion } from './version/version'

describe('protobase', () => {
  it('prints its version with --version and -v', () => {
    expect(program.version()).toBe(protobaseVersion)
    expect(program.helpInformation()).toContain('-v, --version')
  })
})
