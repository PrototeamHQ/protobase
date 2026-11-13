import { describe, expect, it } from 'vitest'
import { storagePushChoices } from './push-choices'

const memory = (initial?: string) => {
  const items = new Map<string, string>(initial === undefined ? [] : [['protobase:push-choices', initial]])
  return { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => void items.set(key, value) }
}

describe('storagePushChoices', () => {
  it('keeps each user\'s last choice', () => {
    const storage = memory()
    const choices = storagePushChoices(() => storage)
    choices.set('alice', 'on')
    choices.set('bob', 'off')
    choices.set('alice', 'off')
    expect([choices.of('alice'), choices.of('bob'), choices.of('carol')]).toEqual(['off', 'off', undefined])
  })

  it('knows no choice when its storage cannot be read or written', () => {
    const broken = memory('{')
    expect(storagePushChoices(() => broken).of('alice')).toBeUndefined()
    const odd = memory('{"alice":"maybe","__proto__":"on"}')
    expect([storagePushChoices(() => odd).of('alice'), storagePushChoices(() => odd).of('toString')]).toEqual([undefined, undefined])
    const missing = storagePushChoices(() => {
      throw new ReferenceError('localStorage is not defined')
    })
    expect(() => missing.set('alice', 'on')).not.toThrow()
    expect(missing.of('alice')).toBeUndefined()
  })
})
