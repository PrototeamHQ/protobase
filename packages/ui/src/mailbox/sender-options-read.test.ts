import { afterEach, describe, expect, it, vi } from 'vitest'
import { forgetSenderOptions, onForgetSenderOptions, readSenderOptions } from './sender-options-read'

const senders = () => vi.fn(async () => ({ address: 'ana@gmail.example', senders: [] }))

afterEach(() => forgetSenderOptions())

describe('the shared read of sender options', () => {
  it('serves every field that asks within half a minute from one read', async () => {
    const mailSenders = senders()
    const [first, second] = await Promise.all([readSenderOptions({ owner: 'ana', mailSenders }), readSenderOptions({ owner: 'ana', mailSenders })])
    expect(first).toEqual([{ address: 'ana@gmail.example' }])
    expect(second).toBe(first)
    expect(mailSenders).toHaveBeenCalledTimes(1)
  })

  it('reads again once forgotten, and has each mounted field read again until it unmounts', async () => {
    const mailSenders = senders()
    await readSenderOptions({ owner: 'ana', mailSenders })
    const reread = vi.fn()
    const unmount = onForgetSenderOptions(reread)
    forgetSenderOptions()
    expect(reread).toHaveBeenCalledTimes(1)
    await readSenderOptions({ owner: 'ana', mailSenders })
    expect(mailSenders).toHaveBeenCalledTimes(2)
    unmount()
    forgetSenderOptions()
    expect(reread).toHaveBeenCalledTimes(1)
  })

  it('keeps no failed read, so the next field reads again', async () => {
    const failing = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    await expect(readSenderOptions({ owner: 'ana', mailSenders: failing })).rejects.toThrow('Failed to fetch')
    const mailSenders = senders()
    expect(await readSenderOptions({ owner: 'ana', mailSenders })).toEqual([{ address: 'ana@gmail.example' }])
  })
})
