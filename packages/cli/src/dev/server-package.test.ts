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

  it("takes the CLI's framework packages for a project without a package.json", () => {
    expect(serverPackage(projectDir, cliDir)).toEqual({ from: 'cli', root: cliDir, dedupe: ['@protobase/layout', '@protobase/query', '@protobase/schema', '@protobase/server'] })
  })

  it("takes the CLI's for a package.json that does not list @protobase/server, whatever else it lists", async () => {
    await manifest({ dependencies: { '@protobase/schema': '^0.14.0', react: '^19.0.0' } })
    expect(serverPackage(projectDir, cliDir).from).toBe('cli')
  })

  it("takes the project's own when any dependency field lists it", async () => {
    for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
      await manifest({ [field]: { '@protobase/server': '^0.14.0' } })
      expect(serverPackage(projectDir, cliDir)).toEqual({ from: 'project', root: projectDir, dedupe: ['@protobase/server'] })
    }
  })
})
