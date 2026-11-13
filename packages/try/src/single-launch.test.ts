import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { holdHome } from './single-launch'

describe('holdHome', () => {
  let home = ''
  beforeEach(() => {
    home = mkdtempSync(path.join(tmpdir(), 'protobase-try-'))
  })
  afterEach(() => rmSync(home, { recursive: true, force: true }))

  it('holds the folder until released', () => {
    const release = holdHome(home, () => true)
    expect(() => holdHome(home, () => true)).toThrow(`Protobase already runs from ${home} (process ${process.pid})`)
    release()
    expect(existsSync(path.join(home, 'launcher.pid'))).toBe(false)
    holdHome(home, () => true)()
  })

  it('takes over from a launcher that was killed', () => {
    writeFileSync(path.join(home, 'launcher.pid'), '2147483646')
    holdHome(home, () => true)()
  })

  it('takes over when the process id lives on but the database does not run', () => {
    writeFileSync(path.join(home, 'launcher.pid'), String(process.pid))
    holdHome(home, () => false)()
  })
})
