import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { PGlite } from '@electric-sql/pglite'
import type { TestProject } from 'vitest/node'
import { buildEmptyPg } from './pglite-snapshot'
import { buildTestPg, testDbSnapshot } from './query'
import { buildAuthPg } from './auth'
import { buildFixturePg } from './server'

const builds: Record<string, () => Promise<PGlite>> = {
  empty: buildEmptyPg,
  server: buildFixturePg,
  auth: buildAuthPg,
  [testDbSnapshot()]: () => buildTestPg(),
  [testDbSnapshot({ trigram: true })]: () => buildTestPg({ trigram: true }),
}

// Builds each PGlite fixture once per run and dumps its data directory; test files start from the dump.
export default async function setup(project: TestProject) {
  const dir = await mkdtemp(path.join(tmpdir(), 'protobase-pglite-'))
  const files: Record<string, string> = {}
  for (const [name, build] of Object.entries(builds)) {
    const pg = await build()
    const dump = await pg.dumpDataDir('none')
    files[name] = path.join(dir, `${name}.tar`)
    await writeFile(files[name], Buffer.from(await dump.arrayBuffer()))
    await pg.close()
  }
  project.provide('pgliteSnapshots', files)
  return () => rm(dir, { recursive: true, force: true })
}
