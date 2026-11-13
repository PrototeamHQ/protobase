import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { unpackApp } from './app-bundle'

describe('unpackApp', () => {
  let dir = ''
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'protobase-try-'))
    writeFileSync(path.join(dir, 'config.js'), 'export default {}')
    writeFileSync(path.join(dir, 'index.html'), '<html>')
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))
  const bundle = (id: string) => ({ id, files: [['protobase.config.js', path.join(dir, 'config.js')], ['public/index.html', path.join(dir, 'index.html')]] as [string, string][] })

  it('writes the bundle into home/app on the first run', () => {
    const home = path.join(dir, 'home')
    expect(unpackApp(home, bundle('a'))).toEqual({ dir: path.join(home, 'app'), updated: true })
    expect(readFileSync(path.join(home, 'app', 'public', 'index.html'), 'utf8')).toBe('<html>')
  })

  it('keeps the copy of the same build', () => {
    const home = path.join(dir, 'home')
    unpackApp(home, bundle('a'))
    expect(unpackApp(home, bundle('a')).updated).toBe(false)
  })

  it('replaces the copy of another build, dropping its old files', () => {
    const home = path.join(dir, 'home')
    unpackApp(home, bundle('a'))
    writeFileSync(path.join(home, 'app', 'stale.js'), '')
    expect(unpackApp(home, bundle('b')).updated).toBe(true)
    expect(() => readFileSync(path.join(home, 'app', 'stale.js'))).toThrow()
  })
})
