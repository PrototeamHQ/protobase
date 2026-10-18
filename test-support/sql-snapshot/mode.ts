import { TestRunner } from 'vitest'

/** `record` under `bun run test:record`, which runs the queries on Postgres; otherwise `replay`, which reads them back. */
export const snapshotMode = process.env.SQL_SNAPSHOT === 'record' ? 'record' : 'replay'

export const recording = snapshotMode === 'record'

/** Queries outside a test, in a beforeAll, afterAll or at the top of the file, are recorded under this. */
export const hooksScope = '(hooks)'

/** The test that is running, by its name with its suites', or `(hooks)` outside one. */
export const currentScope = () => TestRunner.getCurrentTest()?.fullTestName ?? hooksScope

export const staleSnapshot = (why: string) => new Error(`stale snapshot: run \`bun run test:record\`. ${why}`)
