import { describe, expect, it, vi } from 'vitest'
import type { Admin } from '../types'
import { latestAdmin, versionCheckMs } from './latest-admin'

const admin = (name: string) => ({ name }) as unknown as Admin

const setup = (versions: string[]) => {
  let time = 0
  const readVersion = vi.fn(async () => versions.shift()!)
  const rebuild = vi.fn(async () => admin(`built ${rebuild.mock.calls.length}`))
  const latest = latestAdmin({ admin: admin('first'), version: '1', readVersion, rebuild, now: () => time })
  return { latest, readVersion, rebuild, wait: (ms: number) => void (time += ms) }
}

describe('latestAdmin', () => {
  it('reads the version no more than once a second unless asked to at once', async () => {
    const { latest, readVersion, wait } = setup(['1', '1'])
    await latest.get()
    wait(versionCheckMs - 1)
    expect(await latest.get()).toEqual(admin('first'))
    expect(readVersion).not.toHaveBeenCalled()
    wait(1)
    await latest.get()
    await latest.get()
    expect(readVersion).toHaveBeenCalledTimes(1)
    await latest.get(true)
    expect(readVersion).toHaveBeenCalledTimes(2)
  })

  it('builds once when two requests find a new version together, and keeps only the admin built', async () => {
    const { latest, rebuild } = setup(['2'])
    const [one, two] = await Promise.all([latest.get(true), latest.get(true)])
    expect(rebuild).toHaveBeenCalledTimes(1)
    expect(one).toBe(two)
    expect(latest.current()).toBe(one)
  })

  it('fails the request when the version read fails, and reads it again on the next one that checks', async () => {
    const { latest, readVersion, wait } = setup([])
    wait(versionCheckMs)
    readVersion.mockRejectedValueOnce(new Error('connection refused'))
    await expect(latest.get()).rejects.toThrow('connection refused')
    readVersion.mockResolvedValueOnce('1')
    expect(await latest.get()).toEqual(admin('first'))
    expect(readVersion).toHaveBeenCalledTimes(2)
  })

  it('reads the version again on the next request when the rebuild fails to read the tables', async () => {
    const { latest, rebuild, wait } = setup(['2', '2'])
    wait(versionCheckMs)
    rebuild.mockRejectedValueOnce(new Error('connection refused'))
    await expect(latest.get()).rejects.toThrow('connection refused')
    expect(await latest.get()).toEqual(admin('built 2'))
  })
})
