import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { savePort } from '../dev/dev-port'
import { livePort } from './live-port'

let projectDir: string
beforeEach(async () => {
  projectDir = await mkdtemp(path.join(tmpdir(), 'live-port-'))
})
afterEach(() => rm(projectDir, { recursive: true, force: true }))

describe('livePort', () => {
  it('takes --port over the kept one', async () => {
    await savePort(projectDir, 23456)
    expect(await livePort(projectDir, 6123)).toBe(6123)
  })

  it('opens the port protobase dev keeps for the project', async () => {
    await savePort(projectDir, 23456)
    expect(await livePort(projectDir, undefined)).toBe(23456)
  })

  it('stops when dev has kept no port yet', async () => {
    await expect(livePort(projectDir, undefined)).rejects.toThrow('run protobase dev first, or pass --port <port>')
  })
})
