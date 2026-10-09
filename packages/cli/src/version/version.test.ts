import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, it } from 'vitest'
import { protobaseVersion } from './version'

it('is the version in @protobase/cli\'s package.json', async () => {
  const packageJson = JSON.parse(await readFile(path.resolve(__dirname, '../../package.json'), 'utf8'))
  expect(protobaseVersion).toBe(packageJson.version)
})
