import { describe, expect, it } from 'vitest'
import { storagePushKeptOff } from './push-kept-off'

const memory = (initial?: string) => {
  const items = new Map<string, string>(initial === undefined ? [] : [['protobase:push-kept-off', initial]])
  return { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => void items.set(key, value) }
}

describe('storagePushKeptOff', () => {
  it('keeps each user off until they turn push on again', () => {
    const storage = memory()
    const keptOff = storagePushKeptOff(() => storage)
    keptOff.add('alice')
    keptOff.add('alice')
    keptOff.add('bob')
    keptOff.remove('alice')
    expect([keptOff.has('alice'), keptOff.has('bob')]).toEqual([false, true])
  })

  it('keeps no one off when its storage cannot be read or written', () => {
    const broken = memory('{')
    expect(storagePushKeptOff(() => broken).has('alice')).toBe(false)
    const missing = storagePushKeptOff(() => {
      throw new ReferenceError('localStorage is not defined')
    })
    expect(() => missing.add('alice')).not.toThrow()
    expect(missing.has('alice')).toBe(false)
  })
})
