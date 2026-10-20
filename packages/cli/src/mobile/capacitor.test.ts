import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { capacitorRunner } from './capacitor'

let dir = ''
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('capacitorRunner', () => {
  it('runs the workspace\'s own Capacitor CLI with Node, in the workspace, with the environment given', async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'protobase-cap-'))
    mkdirSync(path.join(dir, 'node_modules', '@capacitor', 'cli'), { recursive: true })
    writeFileSync(path.join(dir, 'node_modules', '@capacitor', 'cli', 'package.json'), JSON.stringify({ name: '@capacitor/cli', version: '8.5.3', bin: { cap: './bin/capacitor' } }))
    const calls: unknown[][] = []
    await capacitorRunner(dir, { CI: 'true' }, async (...args) => void calls.push(args))(['add', 'ios'])
    expect(calls).toEqual([['node', [path.join(dir, 'node_modules', '@capacitor', 'cli', 'bin', 'capacitor'), 'add', 'ios'], { cwd: dir, env: { CI: 'true' } }]])
  })

  it('refuses a Capacitor CLI that is not installed in the workspace, even when the project has one', async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'protobase-cap-'))
    mkdirSync(path.join(dir, 'node_modules', '@capacitor', 'cli'), { recursive: true })
    writeFileSync(path.join(dir, 'node_modules', '@capacitor', 'cli', 'package.json'), JSON.stringify({ name: '@capacitor/cli', bin: { cap: './bin/capacitor' } }))
    const ws = path.join(dir, '.protobase', 'mobile')
    mkdirSync(ws, { recursive: true })
    await expect(capacitorRunner(ws, {}, async () => {})(['add', 'ios'])).rejects.toThrow('@capacitor/cli is not installed')
  })
})
