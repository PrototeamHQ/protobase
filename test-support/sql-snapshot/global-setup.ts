import { randomBytes } from 'node:crypto'
import type { TestProject } from 'vitest/node'
import { snapshotTemplates } from '../../scripts/test-db/snapshot-templates'
import { connectServer, templateState } from '../../scripts/test-db/templates'

// Global setup of `bun run test:record`: the snapshot templates must be built and current, and the clones a run leaves
// behind, say after a crash, are dropped when it ends. A normal run replays and needs none of this.
export default async function setup(project: TestProject) {
  if (process.env.SQL_SNAPSHOT !== 'record') return
  for (const template of Object.values(snapshotTemplates)) {
    const state = await templateState(template)
    if (state === 'unreachable') throw new Error('No Postgres server to record on: start it with `bun run db:up`, or set TEST_POSTGRES_URL')
    if (state !== 'ready') throw new Error(`${template.database} is ${state}: run bun run test:db snapshots`)
  }
  const runId = randomBytes(4).toString('hex')
  project.provide('snapshotRunId', runId)
  return async () => {
    const sql = connectServer()
    const left = await sql<{ datname: string }[]>`select datname from pg_database where datname like ${`snapshot\\_${runId}\\_%`}`
    for (const { datname } of left) await sql.unsafe(`drop database "${datname}" with (force)`)
    await sql.end()
  }
}
