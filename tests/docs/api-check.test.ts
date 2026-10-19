import { spawnSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '../..')
const website = path.join(root, 'website')

const run = (cwd: string, ...args: string[]) => spawnSync('bun', ['run', ...args], { cwd, encoding: 'utf8' })

// `bun run docs:api-check`: TypeDoc's validation of the API reference with website/typedoc.json, as docs:build runs it.
describe('docs:api-check', () => {
  it('passes on the schema package', () => {
    const result = run(root, 'docs:api-check')
    expect(result.stderr + result.stdout).not.toMatch(/\[(warning|error)\]/)
    expect(result.status).toBe(0)
  })

  // A package named as the schema's, with the website's options and only its entry point and tsconfig of its own.
  describe('on a package with an undocumented export', () => {
    let dir = ''
    beforeEach(async () => {
      dir = await mkdtemp(path.join(tmpdir(), 'protobase-api-check-'))
      await writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: '@protobase/schema' }))
      await writeFile(path.join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true }, files: ['index.ts'] }))
      await writeFile(path.join(dir, 'index.ts'), '/** Documented. */\nexport const documented = 1\nexport const undocumented = 2\n')
      const options = { extends: [path.join(website, 'typedoc.json')], entryPoints: ['index.ts'], tsconfig: 'tsconfig.json' }
      await writeFile(path.join(dir, 'typedoc.json'), JSON.stringify(options))
    })
    afterEach(() => rm(dir, { recursive: true, force: true }))

    it('fails, naming the export', () => {
      const result = run(website, 'api-check', '--options', path.join(dir, 'typedoc.json'))
      const output = result.stderr + result.stdout
      expect(output).toContain('undocumented (Variable), defined in @protobase/schema/index.ts, does not have any documentation')
      expect(output).not.toMatch(/\bdocumented \(Variable\)/)
      expect(result.status).not.toBe(0)
    })
  })
})
