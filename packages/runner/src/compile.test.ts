import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { compileArgs } from './compile'
import packageJson from '../package.json' with { type: 'json' }

const scratch = mkdtempSync(path.join(tmpdir(), 'protobase-runner-compile-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

describe('the compiled runner', () => {
  // Compiled for this machine with the arguments of the release's build; JSC says which code it found cached.
  it('starts from the bytecode it carries', () => {
    const outfile = path.join(scratch, 'protobase-runner')
    execFileSync('bun', compileArgs('bun', outfile, path.join(import.meta.dirname, 'main.ts')), { stdio: 'ignore' })
    const run = spawnSync(outfile, ['version'], { env: { ...process.env, BUN_JSC_verboseDiskCache: '1' }, encoding: 'utf8' })
    expect(run.stderr).toContain('[Disk Cache] Cache hit for sourceCode')
    expect(run.stdout.trim()).toBe(packageJson.version)
  }, 60_000)
})
