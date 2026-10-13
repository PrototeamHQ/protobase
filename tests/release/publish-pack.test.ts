import { spawnSync } from 'node:child_process'
import { chmod, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '../..')

// Stands in for Bun: `bun run build` does nothing, and `bun pm pack` fails when the package.json of another package is
// not as the test found it. `bun pm pack` reads every workspace's package.json, so one rewritten or restored for
// another pack meanwhile can be read half-written, which failed the 0.13.1 and 0.13.2 releases.
const fakeBun = `#!${process.execPath}
const { readFileSync } = require('node:fs')
const path = require('node:path')
if (process.argv[2] === 'pm') {
  const own = path.join(process.cwd(), 'package.json')
  for (const [file, content] of Object.entries(JSON.parse(readFileSync(process.env.MANIFESTS, 'utf8')))) {
    if (file !== own && readFileSync(file, 'utf8') !== content) {
      console.error(file + ' changed while ' + own + ' was packed')
      process.exit(1)
    }
  }
}
`

const readManifests = async () => {
  const dirs = await readdir(path.join(root, 'packages'))
  const files = dirs.map((dir) => path.join(root, 'packages', dir, 'package.json'))
  return Object.fromEntries(await Promise.all(files.map(async (file) => [file, await readFile(file, 'utf8')] as const)))
}

describe('scripts/publish.mjs --pack', () => {
  let binDir = ''
  afterEach(() => rm(binDir, { recursive: true, force: true }))

  it('packs every public package while the others keep their package.json, and restores each one', async () => {
    binDir = await mkdtemp(path.join(tmpdir(), 'protobase-fake-bun-'))
    await writeFile(path.join(binDir, 'bun'), fakeBun)
    await chmod(path.join(binDir, 'bun'), 0o755)
    const manifests = await readManifests()
    await writeFile(path.join(binDir, 'manifests.json'), JSON.stringify(manifests))

    const env = { ...process.env, PATH: `${binDir}${path.delimiter}${process.env.PATH}`, MANIFESTS: path.join(binDir, 'manifests.json') }
    const packed = spawnSync(process.execPath, ['scripts/publish.mjs', '--pack'], { cwd: root, env, encoding: 'utf8' })

    expect(packed.stderr).toBe('')
    expect(packed.status).toBe(0)
    const publicPackages = Object.values(manifests).filter((content) => !JSON.parse(content).private)
    expect(packed.stdout.match(/^packed /gm)).toHaveLength(publicPackages.length)
    expect(await readManifests()).toEqual(manifests)
  })
})
