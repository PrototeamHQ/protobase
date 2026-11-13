import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { homeDir, readOpenBrowser, readSettings, writeSettings } from './settings'

describe('homeDir', () => {
  it('keeps everything in LOCALAPPDATA\\Protobase\\automations', () => {
    expect(homeDir({ LOCALAPPDATA: '/local' })).toBe(path.join('/local', 'Protobase', 'automations'))
  })

  it('takes PROTOBASE_HOME over it', () => {
    expect(homeDir({ PROTOBASE_HOME: '/elsewhere', LOCALAPPDATA: '/local' })).toBe(path.resolve('/elsewhere'))
  })

  it('refuses to guess without either', () => {
    expect(() => homeDir({})).toThrow('LOCALAPPDATA is not set')
  })
})

describe('readOpenBrowser', () => {
  it('is true unless PROTOBASE_OPEN_BROWSER is false', () => {
    expect(readOpenBrowser({})).toBe(true)
    expect(readOpenBrowser({ PROTOBASE_OPEN_BROWSER: 'false' })).toBe(false)
  })

  it('refuses anything but true or false', () => {
    expect(() => readOpenBrowser({ PROTOBASE_OPEN_BROWSER: 'no' })).toThrow('PROTOBASE_OPEN_BROWSER must be true or false, not "no"')
  })
})

describe('readSettings', () => {
  const dirs: string[] = []
  afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })))
  const home = () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'protobase-try-'))
    dirs.push(dir)
    return path.join(dir, 'home')
  }

  it('makes new secrets on the first run and keeps them after', () => {
    const dir = home()
    const first = readSettings(dir)
    expect(first).toMatchObject({ dbPort: 55432, appPort: 3000 })
    expect(first.secret).not.toBe(first.dbPassword)
    expect(readSettings(dir)).toEqual(first)
  })

  it('keeps the admin once written', () => {
    const dir = home()
    const admin = { email: 'admin@example.com', password: 'pw' }
    writeSettings(dir, { ...readSettings(dir), admin })
    expect(readSettings(dir).admin).toEqual(admin)
  })
})
