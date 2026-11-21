import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { relayBinary, relayPackageEntry } from './relay-binary'

describe('relayBinary', () => {
  let root: string
  const projectDir = () => path.join(root, 'app')
  const cliDir = () => path.join(root, 'cli')
  // A stand-in of the package whose binaryPath() names the folder it was installed in.
  const install = async (dir: string) => {
    const pkg = path.join(dir, 'node_modules', '@protobase', 'realtime')
    await mkdir(pkg, { recursive: true })
    await writeFile(path.join(pkg, 'package.json'), JSON.stringify({ name: '@protobase/realtime', type: 'module', exports: './index.js' }))
    await writeFile(path.join(pkg, 'index.js'), `export const binaryPath = () => ${JSON.stringify(path.join(dir, 'relay'))}\n`)
  }

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'protobase-relay-binary-'))
    await mkdir(projectDir())
    await mkdir(cliDir())
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it("takes the project's own install first", async () => {
    await install(projectDir())
    await install(cliDir())
    expect(await relayBinary(projectDir(), cliDir())).toBe(path.join(projectDir(), 'relay'))
  })

  it("takes the CLI's when the project has none", async () => {
    await install(cliDir())
    expect(await relayBinary(projectDir(), cliDir())).toBe(path.join(cliDir(), 'relay'))
  })

  it('names the package and the way around it when neither has it', () => {
    expect(() => relayPackageEntry(projectDir(), cliDir())).toThrow(/@protobase\/realtime, which is not installed: add it to the project's devDependencies, or set realtime.relay.url/)
  })
})
