import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { runCommand } from './runner'
import { protobaseVersion } from './version/version'

const projectDir = realpathSync(mkdtempSync(path.join(tmpdir(), 'protobase-runner-')))
const otherDir = realpathSync(mkdtempSync(path.join(tmpdir(), 'protobase-runner-')))

afterAll(() => {
  rmSync(projectDir, { recursive: true, force: true })
  rmSync(otherDir, { recursive: true, force: true })
})

// The first doctor run transforms the modules doctor imports.
describe('runCommand', { timeout: 60_000 }, () => {
  it('returns what a command prints and its exit code', async () => {
    expect(await runCommand(['--version'])).toEqual({ exitCode: 0, stdout: `${protobaseVersion}\n`, stderr: '' })
  })

  it('returns the one-line error and exit code 1 of a command that fails', async () => {
    const result = await runCommand(['nope'])
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("unknown command 'nope'")
  })

  it('runs the command in the given folder with the given environment only', async () => {
    const withUrl = await runCommand(['doctor'], { cwd: projectDir, env: { DATABASE_URL: 'postgres://nobody@127.0.0.1:1/none' } })
    expect(withUrl).toMatchObject({ exitCode: 1, stderr: `error: No config in ${path.join(projectDir, 'config')}: write it with \`protobase scaffold\`, or pass --config <dir>\n` })
    const withoutUrl = await runCommand(['doctor'], { cwd: projectDir, env: {} })
    expect(withoutUrl.stderr).toContain('Pass a connection string or --env <VARIABLE>')
  })

  it('leaves the working folder, environment, exit code and output of this process as they were', async () => {
    const cwd = process.cwd()
    const env = { ...process.env }
    await runCommand(['doctor'], { cwd: projectDir, env: { DATABASE_URL: 'postgres://nobody@127.0.0.1:1/none' } })
    expect(process.cwd()).toBe(cwd)
    expect(process.env).toEqual(env)
    expect(process.exitCode).toBeFalsy()
  })

  it('runs commands one at a time, each in its own folder', async () => {
    const env = { DATABASE_URL: 'postgres://nobody@127.0.0.1:1/none' }
    const [first, second] = await Promise.all([runCommand(['doctor'], { cwd: projectDir, env }), runCommand(['doctor'], { cwd: otherDir, env })])
    expect(first.stderr).toContain(path.join(projectDir, 'config'))
    expect(second.stderr).toContain(path.join(otherDir, 'config'))
  })

  it('refuses the commands that run until a signal', async () => {
    await expect(runCommand(['dev'])).rejects.toThrow('protobase dev runs until a signal; start it as a process')
  })
})
