import { describe, expect, it } from 'vitest'
import { saveStrongSignIn, strongSignInAt } from './strong-sign-ins'

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

const session = { id: 's1', expiresAt: new Date('2026-08-08T12:00:00Z') }

describe('strong sign-ins', () => {
  it('keeps one note per session, the latest, until the session expires', async () => {
    const internal = store()
    await saveStrongSignIn(internal as never, session, new Date('2026-08-01T11:00:00Z'))
    await saveStrongSignIn(internal as never, session, new Date('2026-08-01T12:00:00Z'))
    expect(internal.values()).toEqual([{ identifier: 'protobase-strong-sign-in-s1', value: '2026-08-01T12:00:00.000Z', expiresAt: session.expiresAt }])
    expect(await strongSignInAt(internal as never, 's1', new Date('2026-08-01T12:05:00Z'))).toEqual(new Date('2026-08-01T12:00:00Z'))
  })

  it('knows none for a session that never proved one, or once its note expired', async () => {
    const internal = store()
    expect(await strongSignInAt(internal as never, 's1')).toBeUndefined()
    await saveStrongSignIn(internal as never, session, new Date('2026-08-01T12:00:00Z'))
    expect(await strongSignInAt(internal as never, 's2')).toBeUndefined()
    expect(await strongSignInAt(internal as never, 's1', new Date('2026-08-09T00:00:00Z'))).toBeUndefined()
  })
})
