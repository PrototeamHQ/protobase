import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { holdHome } from './single-launch'

describe('holdHome', () => {
  let dir = ''
  let home = ''
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'protobase-try-'))
    home = path.join(dir, 'home')
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('creates the folder and holds it until released', () => {
    const release = holdHome(home, () => true)
    expect(existsSync(path.join(home, 'launcher.pid'))).toBe(true)
    release()
    expect(existsSync(path.join(home, 'launcher.pid'))).toBe(false)
  })

  it('refuses while another launcher holds it', () => {
    holdHome(home, () => true)
    writeFileSync(path.join(home, 'launcher.pid'), '4242')
    expect(() => holdHome(home, (pid) => pid === 4242)).toThrow(`Protobase already runs from ${home} (process 4242)`)
  })

  it('takes over a file whose process is no launcher', () => {
    holdHome(home, () => true)
    writeFileSync(path.join(home, 'launcher.pid'), '4242')
    holdHome(home, () => false)()
  })
})
