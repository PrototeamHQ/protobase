import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { holdHome, homePipe } from './single-launch'

describe('homePipe', () => {
  it('names one pipe per folder, whatever its case', () => {
    expect(homePipe('C:\\Users\\Ada\\AppData\\Local\\Protobase\\automations')).toBe(homePipe('c:\\users\\ada\\appdata\\local\\protobase\\automations'))
    expect(homePipe('C:\\one')).not.toBe(homePipe('C:\\two'))
    expect(homePipe('C:\\one')).toMatch(/^\\\\\.\\pipe\\protobase-try-[0-9a-f]{24}$/)
  })
})

// A Unix socket stands in for the pipe where the tests run on macOS or Linux.
describe('holdHome', () => {
  let dir = ''
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'protobase-try-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('refuses a second launcher until the first releases the folder', async () => {
    const address = process.platform === 'win32' ? homePipe(dir) : path.join(dir, 'lock.sock')
    const release = await holdHome(address, 'home')
    await expect(holdHome(address, 'home')).rejects.toThrow('Protobase already runs from home: use its window, or stop it first')
    release()
    await new Promise((resolve) => setTimeout(resolve, 50))
    ;(await holdHome(address, 'home'))()
  })
})
