import { TestRunner } from 'vitest'

/** `record` under `bun run test:record`, which runs the queries on Postgres; otherwise `replay`, which reads them back. */
export const snapshotMode = process.env.SQL_SNAPSHOT === 'record' ? 'record' : 'replay'

export const recording = snapshotMode === 'record'

/** Queries outside a test, in a beforeAll, afterAll or at the top of the file, are recorded under this. */
export const hooksScope = '(hooks)'

let forced: string | undefined

/** Runs `work` with every query counted as `scope`'s, whichever test is running. */
export const inScope = async <T>(scope: string, work: () => Promise<T>) => {
  forced = scope
  try {
    return await work()
  } finally {
    forced = undefined
  }
}

/** The test that is running, by its name with its suites', or `(hooks)` outside one. */
export const currentScope = () => forced ?? TestRunner.getCurrentTest()?.fullTestName ?? hooksScope

export const staleSnapshot = (why: string) => new Error(`stale snapshot: run \`bun run test:record\`. ${why}`)
