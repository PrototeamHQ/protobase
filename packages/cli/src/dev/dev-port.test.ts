import { mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { devPort, devPortFile, pickFreePort, randomPorts, readSavedPort, savePort } from './dev-port'

let projectDir: string
beforeEach(async () => {
  projectDir = await mkdtemp(path.join(tmpdir(), 'dev-port-'))
})
afterEach(() => rm(projectDir, { recursive: true, force: true }))

const saved = () => readFile(path.join(projectDir, devPortFile), 'utf8')
const writeSaved = async (text: string) => {
  await mkdir(path.join(projectDir, '.protobase'), { recursive: true })
  await writeFile(path.join(projectDir, devPortFile), text)
}
const picks = (...ports: number[]) => async () => ports.shift()!

describe('devPort', () => {
  it('picks a port the first time, saves it and uses it again on the next run', async () => {
    expect(await devPort(projectDir, undefined, picks(23456))).toBe(23456)
    expect(await saved()).toBe('23456\n')
    expect(await devPort(projectDir, undefined, picks(34567))).toBe(23456)
  })

  it('uses --port and keeps it for the runs without it', async () => {
    await writeSaved('23456\n')
    expect(await devPort(projectDir, 6123, picks(34567))).toBe(6123)
    expect(await devPort(projectDir, undefined, picks(34567))).toBe(6123)
  })

  it('keeps a port per project', async () => {
    const other = await mkdtemp(path.join(tmpdir(), 'dev-port-'))
    expect(await devPort(projectDir, undefined, picks(23456))).toBe(23456)
    expect(await devPort(other, undefined, picks(34567))).toBe(34567)
    expect(await devPort(projectDir, undefined, picks(45678))).toBe(23456)
    await rm(other, { recursive: true, force: true })
  })

  it.each(['', 'abc', '0', '70000', '12.5'])('picks and saves a new port when the file holds %j', async (text) => {
    await writeSaved(text)
    expect(await devPort(projectDir, undefined, picks(23456))).toBe(23456)
    expect(await saved()).toBe('23456\n')
  })
})

describe('savePort', () => {
  // A running dev server rebuilds its API on any write inside the project, as when a second dev is refused its port.
  it('leaves the file alone when it already holds the port', async () => {
    await writeSaved('23456\n')
    const file = path.join(projectDir, devPortFile)
    const past = new Date('2020-01-01T00:00:00Z')
    await utimes(file, past, past)
    await savePort(projectDir, 23456)
    expect((await stat(file)).mtime).toEqual(past)
    await savePort(projectDir, 6123)
    expect(await saved()).toBe('6123\n')
  })
})

describe('readSavedPort', () => {
  it('reads nothing from a project without the file', async () => {
    expect(await readSavedPort(projectDir)).toBeUndefined()
  })
})

describe('pickFreePort', () => {
  it('draws from the range, skipping a port held on either loopback address', async () => {
    const draws = [0, 0.5, 0.9999999]
    const port = await pickFreePort(async (port) => (port === randomPorts.min ? '::1' : undefined), () => draws.shift()!)
    expect(port).toBe(randomPorts.min + Math.floor(0.5 * (randomPorts.max - randomPorts.min + 1)))
    expect(await pickFreePort(async () => undefined, () => 0.9999999)).toBe(randomPorts.max)
  })

  it('stops after a fixed number of held ports', async () => {
    await expect(pickFreePort(async () => '127.0.0.1', () => 0)).rejects.toThrow('pass one with --port <port>')
  })
})
