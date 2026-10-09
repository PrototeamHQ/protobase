import { readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { writePackage } from '../../../tests/support/packages'
import { hostPackages, hostVersionProblem } from './host-packages'

const root = path.resolve(__dirname, '../../../../..')
const cliRoot = path.join(root, 'packages/cli')
const ownVersion = (name: string) => JSON.parse(readFileSync(path.join(cliRoot, 'node_modules', name, 'package.json'), 'utf8')).version as string

describe('hostPackages', () => {
  it('holds the @protobase packages and their dependencies, not the dev dependencies', () => {
    for (const name of ['@protobase/cli', '@protobase/schema', '@protobase/server', '@protobase/ui', '@protobase/client', 'pg', 'postgres', 'kysely', 'better-auth', 'zod', 'react', '@dnd-kit/core']) expect(hostPackages.has(name)).toBe(true)
    for (const name of ['vitest', 'typescript', '@commitlint/cli']) expect(hostPackages.has(name)).toBe(false)
  })
})

describe('hostVersionProblem', () => {
  let dir = ''
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'protobase-host-version-'))
  })
  afterEach(() => rm(dir, { recursive: true, force: true }))

  it('accepts the runtime\'s own copy, a project without one and another version of the same major', async () => {
    expect(await hostVersionProblem('pg', path.join(root, 'examples/erp'))).toBeUndefined()
    expect(await hostVersionProblem('jose', dir)).toBeUndefined()
    await writePackage(dir, { name: 'pg', version: `${ownVersion('pg').split('.')[0]}.0.0` })
    expect(await hostVersionProblem('pg', dir)).toBeUndefined()
  })

  it('refuses another major, or another minor below 1.0, which the runtime\'s copy would replace', async () => {
    await writePackage(dir, { name: 'zod', version: '3.25.0' })
    expect(await hostVersionProblem('zod', dir)).toBe(`zod 3.25.0 is installed here, but the serve runtime supplies zod ${ownVersion('zod')}; use a version compatible with it`)
    await writePackage(dir, { name: 'kysely', version: '0.27.0' })
    expect(await hostVersionProblem('kysely', dir)).toContain('kysely 0.27.0 is installed here')
  })
})
