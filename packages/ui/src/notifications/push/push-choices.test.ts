import { describe, expect, it } from 'vitest'
import { storagePushChoices } from './push-choices'

const memory = (initial?: string) => {
  const items = new Map<string, string>(initial === undefined ? [] : [['protobase:push-choices', initial]])
  return { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => void items.set(key, value) }
}

const unwritable = () => ({
  getItem: () => null,
  setItem: () => {
    throw new Error('The quota is used up')
  },
})

describe('storagePushChoices', () => {
  it('keeps each user\'s last choice, for later sessions too', () => {
    const storage = memory()
    const choices = storagePushChoices(() => storage)
    expect([choices.set('alice', 'on'), choices.set('bob', 'off'), choices.set('alice', 'off')]).toEqual([true, true, true])
    const later = storagePushChoices(() => storage)
    expect([later.of('alice'), later.of('bob'), later.of('carol')]).toEqual(['off', 'off', undefined])
  })

  it('says a choice it could not store, and keeps it for this session', () => {
    const choices = storagePushChoices(unwritable)
    expect(choices.set('alice', 'off')).toBe(false)
    expect(choices.of('alice')).toBe('off')
  })

  it('answers off for everyone when its storage cannot be read', () => {
    const broken = memory('{')
    expect(storagePushChoices(() => broken).of('alice')).toBe('off')
    const missing = storagePushChoices(() => {
      throw new ReferenceError('localStorage is not defined')
    })
    expect(missing.of('alice')).toBe('off')
    expect(missing.set('alice', 'on')).toBe(false)
    expect(missing.of('alice')).toBe('on')
  })

  it('ignores what is not a choice', () => {
    const odd = memory('{"alice":"maybe"}')
    expect([storagePushChoices(() => odd).of('alice'), storagePushChoices(() => odd).of('toString')]).toEqual([undefined, undefined])
  })
})
