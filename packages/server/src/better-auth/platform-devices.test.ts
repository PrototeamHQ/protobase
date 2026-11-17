import { UnsecuredJWT } from 'jose'
import { describe, expect, it } from 'vitest'
import { deviceNameOf, findIn, idsPerRead } from './platform-devices'

describe('deviceNameOf', () => {
  const idToken = (claims: Record<string, unknown>) => new UnsecuredJWT(claims).encode()

  it("is the device_name claim of the device's last ID token, trimmed", () => {
    expect(deviceNameOf(idToken({ sub: 'device-1', device_name: " Sanne's phone " }))).toBe("Sanne's phone")
  })

  it('is none without a token, without the claim, with an empty or other value, or for no token at all', () => {
    expect(deviceNameOf(undefined)).toBeUndefined()
    expect(deviceNameOf(null)).toBeUndefined()
    expect(deviceNameOf(idToken({ sub: 'device-1' }))).toBeUndefined()
    expect(deviceNameOf(idToken({ device_name: ' ' }))).toBeUndefined()
    expect(deviceNameOf(idToken({ device_name: 42 }))).toBeUndefined()
    expect(deviceNameOf('not a token')).toBeUndefined()
  })
})

describe('findIn', () => {
  it('reads any number of ids in reads of at most idsPerRead each, and gives every row back', async () => {
    const reads: string[][] = []
    const adapter = {
      findMany: async ({ where }: { where: { value: string[] }[] }) => {
        reads.push(where[0]!.value)
        return where[0]!.value.map((id) => ({ id }))
      },
    }
    const ids = Array.from({ length: idsPerRead * 2 + 5 }, (_, index) => `session-${index}`)
    const rows = await findIn<{ id: string }>({ adapter } as never, 'session', 'id', ids)
    expect(reads.map((read) => read.length)).toEqual([idsPerRead, idsPerRead, 5])
    expect(rows.map(({ id }) => id)).toEqual(ids)
  })

  it('reads nothing for no ids', async () => {
    const adapter = { findMany: async () => expect.unreachable() }
    expect(await findIn({ adapter } as never, 'session', 'id', [])).toEqual([])
  })
})
