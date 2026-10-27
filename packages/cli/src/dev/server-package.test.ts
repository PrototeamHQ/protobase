import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { serverPackage } from './server-package'

describe('serverPackage', () => {
  let projectDir: string
  const cliDir = '/cli'
  const manifest = (fields: object) => writeFile(path.join(projectDir, 'package.json'), JSON.stringify({ name: 'app', ...fields }))

  beforeEach(async () => {
    projectDir = await mkdtemp(path.join(tmpdir(), 'protobase-server-package-'))
  })

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true })
  })

  it("takes the CLI's packages, those the serve runtime supplies, for a project without a package.json", () => {
    const resolution = serverPackage(projectDir, cliDir)
    expect(resolution).toMatchObject({ from: 'cli', root: cliDir })
    expect(resolution.dedupe).toEqual(expect.arrayContaining(['@protobase/server', '@protobase/schema', '@protobase/layout', 'kysely', 'pg', 'react']))
  })

  it("takes the CLI's for a bundled project: one that lists no @protobase package, or lists them in devDependencies", async () => {
    await manifest({ dependencies: { react: '^19.0.0' } })
    expect(serverPackage(projectDir, cliDir).from).toBe('cli')
    await manifest({ devDependencies: { '@protobase/server': '^0.14.0', '@protobase/cli': '^0.14.0' } })
    expect(serverPackage(projectDir, cliDir).from).toBe('cli')
  })

  it("takes the project's own for a locked project, one that lists @protobase packages in dependencies", async () => {
    await manifest({ dependencies: { '@protobase/server': '^0.14.0' }, devDependencies: { '@protobase/cli': '^0.14.0' } })
    expect(serverPackage(projectDir, cliDir)).toEqual({ from: 'project', root: projectDir, dedupe: ['@protobase/server'] })
  })
})
