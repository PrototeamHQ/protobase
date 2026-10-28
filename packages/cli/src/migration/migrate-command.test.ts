import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runCommand } from '../runner'
import { protobaseVersion } from '../version/version'

const dirs: string[] = []
afterEach(() => Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))))

// A project of each kind: config only, bundled (the packages in devDependencies) and locked (in dependencies).
const packageFiles = {
  'config-only': undefined,
  bundled: { devDependencies: { '@protobase/cli': `^${protobaseVersion}` } },
  locked: { dependencies: { '@protobase/server': `^${protobaseVersion}` } },
}

const project = async (kind: keyof typeof packageFiles, migrations?: Record<string, string>) => {
  const dir = await realpath(await mkdtemp(path.join(tmpdir(), 'protobase-migrate-')))
  dirs.push(dir)
  await writeFile(path.join(dir, 'protobase.config.ts'), "export default { url: 'http://localhost:1' }\n")
  const manifest = packageFiles[kind]
  if (manifest) await writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'app', ...manifest }))
  if (!migrations) return dir
  await mkdir(path.join(dir, 'db/migrations'), { recursive: true })
  for (const [name, sql] of Object.entries(migrations)) await writeFile(path.join(dir, 'db/migrations', name), sql)
  return dir
}

describe('protobase migrate', { timeout: 60_000 }, () => {
  it.each(Object.keys(packageFiles) as (keyof typeof packageFiles)[])('runs in a %s project, and without db/migrations applies nothing and says so', async (kind) => {
    const result = await runCommand(['migrate'], { cwd: await project(kind), env: {} })
    expect(result).toEqual({ exitCode: 0, stdout: 'the project has no db/migrations\n', stderr: '' })
  })

  it('asks for a connection when there are migrations and none is given', async () => {
    const cwd = await project('config-only', { '001_one.sql': 'create table one (id int)' })
    expect(await runCommand(['migrate'], { cwd, env: {} })).toEqual({
      exitCode: 1,
      stdout: '',
      stderr: 'error: Pass a connection string or --env <VARIABLE>, or set DATABASE_URL in .env\n',
    })
    expect(await runCommand(['migrate', '--env', 'APP_DATABASE_URL'], { cwd, env: {} })).toMatchObject({ exitCode: 1, stderr: 'error: Environment variable APP_DATABASE_URL is not set\n' })
  })

  it('leaves `migration` the command that writes migrations', async () => {
    const result = await runCommand(['migration', '--help'])
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("as the project's next SQL migrations")
  })
})
