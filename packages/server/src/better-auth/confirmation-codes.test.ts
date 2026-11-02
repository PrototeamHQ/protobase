import { describe, expect, it } from 'vitest'
import { checkConfirmationCode, saveConfirmationCode } from './confirmation-codes'

type Value = { identifier: string; value: string; expiresAt: Date }

// Better Auth's verification values, newest last, as its internal adapter keeps them.
const store = () => {
  let values: Value[] = []
  return {
    values: () => values,
    createVerificationValue: async (value: Value) => {
      values.push(value)
      return { id: String(values.length), createdAt: new Date(), updatedAt: new Date(), ...value }
    },
    deleteVerificationByIdentifier: async (identifier: string) => {
      values = values.filter((value) => value.identifier !== identifier)
    },
    findVerificationValue: async (identifier: string) => {
      const found = values.filter((value) => value.identifier === identifier).at(-1)
      return found ? { id: '1', createdAt: new Date(), updatedAt: new Date(), ...found } : null
    },
  }
}

const holder = { userId: 'u1', sessionId: 's1' }
const at = new Date('2026-08-01T12:00:00Z')
const later = (minutes: number) => new Date(at.getTime() + minutes * 60_000)

describe('confirmation codes', () => {
  it('confirms the session once with its code, kept hashed under a name of its own', async () => {
    const internal = store()
    await saveConfirmationCode(internal as never, holder, '123456', at)
    expect(internal.values()).toHaveLength(1)
    expect(internal.values()[0]!.identifier).toBe('protobase-confirmation-code-s1')
    expect(internal.values()[0]!.value).not.toContain('123456')
    expect(await checkConfirmationCode(internal as never, holder, '123456', later(1))).toBe('confirmed')
    expect(await checkConfirmationCode(internal as never, holder, '123456', later(1))).toBe('expired')
  })

  it('refuses the code to another session or another user', async () => {
    const internal = store()
    await saveConfirmationCode(internal as never, holder, '123456', at)
    expect(await checkConfirmationCode(internal as never, { ...holder, sessionId: 's2' }, '123456', later(1))).toBe('expired')
    expect(await checkConfirmationCode(internal as never, { ...holder, userId: 'u2' }, '123456', later(1))).toBe('expired')
    expect(await checkConfirmationCode(internal as never, holder, '123456', later(1))).toBe('confirmed')
  })

  it('stops working after three wrong codes, and once it expired', async () => {
    const internal = store()
    await saveConfirmationCode(internal as never, holder, '123456', at)
    expect(await checkConfirmationCode(internal as never, holder, '000000', later(1))).toBe('wrong')
    expect(await checkConfirmationCode(internal as never, holder, '000001', later(1))).toBe('wrong')
    expect(await checkConfirmationCode(internal as never, holder, '000002', later(1))).toBe('too-many')
    expect(await checkConfirmationCode(internal as never, holder, '123456', later(1))).toBe('expired')

    await saveConfirmationCode(internal as never, holder, '654321', at)
    expect(await checkConfirmationCode(internal as never, holder, '654321', later(11))).toBe('expired')
  })

  it('keeps only the newest code of a session', async () => {
    const internal = store()
    await saveConfirmationCode(internal as never, holder, '123456', at)
    await saveConfirmationCode(internal as never, holder, '654321', at)
    expect(internal.values()).toHaveLength(1)
    expect(await checkConfirmationCode(internal as never, holder, '123456', later(1))).toBe('wrong')
    expect(await checkConfirmationCode(internal as never, holder, '654321', later(1))).toBe('confirmed')
  })
})
