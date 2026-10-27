import { randomBytes } from 'node:crypto'
import type { TestProject } from 'vitest/node'
import { snapshotTemplates } from '../../scripts/test-db/snapshot-templates'
import { connectServer, serverVariable, templateServer, templateState } from '../../scripts/test-db/templates'

// Global setup of the snapshot tests: they run on Bun. Under `bun run test:record` the snapshot templates must also be
// built and current, and the clones a run leaves behind, say after a crash, are dropped when it ends; a normal run
// replays and needs none of this.
export default async function setup(project: TestProject) {
  // Node writes some values in another form than Bun, such as a JWK's keys in another order, so a replay on Node fails
  // as stale snapshots, and a recording made on Node is stale for every replay on Bun.
  if (!process.versions.bun) throw new Error('Snapshot tests run on Bun: run bun run test or bun run test:record, not through Node or bun x')
  if (process.env.SQL_SNAPSHOT !== 'record') return
  for (const template of Object.values(snapshotTemplates)) {
    const state = await templateState(template)
    if (state === 'unreachable') throw new Error(`No Postgres server to record ${template.database} on: start it with \`bun run db:up\`, or set ${serverVariable(template)}`)
    if (state !== 'ready') throw new Error(`${template.database} is ${state}: run bun run test:db snapshots`)
  }
  const runId = randomBytes(4).toString('hex')
  project.provide('snapshotRunId', runId)
  project.provide('snapshotRecordStart', Date.now())
  return async () => {
    for (const server of new Set(Object.values(snapshotTemplates).map(templateServer))) {
      const sql = connectServer(2, server)
      const left = await sql<{ datname: string }[]>`select datname from pg_database where datname like ${`snapshot\\_${runId}\\_%`}`
      for (const { datname } of left) await sql.unsafe(`drop database "${datname}" with (force)`)
      await sql.end()
    }
  }
}
