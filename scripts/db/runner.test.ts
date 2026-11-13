import { describe, expect, it } from 'vitest'
import { parseRunner } from './runner'

describe('parseRunner', () => {
  it('runs Docker when the setting is missing or empty', () => {
    expect(parseRunner(undefined)).toBe('docker')
    expect(parseRunner('')).toBe('docker')
  })

  it('takes docker or local', () => {
    expect(parseRunner('docker')).toBe('docker')
    expect(parseRunner('local')).toBe('local')
  })

  it('rejects anything else, naming the allowed values', () => {
    expect(() => parseRunner('podman')).toThrow('POSTGRES_RUNNER must be docker or local, not "podman"')
  })
})
