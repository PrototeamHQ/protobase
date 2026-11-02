import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { firstPartyCodeKey } from '@protobase/schema/internal'
import { afterEach, describe, expect, it } from 'vitest'
import { build, type Rolldown } from 'vite'
import { firstPartyCode } from './first-party-code'

describe('firstPartyCode', () => {
  let dir = ''
  afterEach(() => rm(dir, { recursive: true, force: true }))

  it("marks every script of the build as the app's own, and adds nothing else", async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'protobase-first-party-'))
    await writeFile(path.join(dir, 'main.js'), "export const page = () => import('./lazy.js')\n")
    await writeFile(path.join(dir, 'lazy.js'), "export const lazy = () => { throw new Error('ours') }\n")
    const result = (await build({
      configFile: false,
      root: dir,
      logLevel: 'silent',
      plugins: [firstPartyCode()],
      build: { write: false, minify: false, lib: { entry: path.join(dir, 'main.js'), formats: ['es'] } },
    })) as Rolldown.RolldownOutput[]

    const chunks = result[0]!.output.filter((file) => file.type === 'chunk')
    expect(chunks).toHaveLength(2)
    for (const chunk of chunks) {
      expect(chunk.code).toContain(`"_sentryBundlerPluginAppKey:${firstPartyCodeKey}": true`)
      expect(chunk.code).not.toContain('SENTRY_RELEASE')
      expect(chunk.code).not.toContain('_sentryDebugIds')
    }
  })
})
