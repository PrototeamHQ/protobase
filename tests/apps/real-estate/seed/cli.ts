import { connect } from '../db/connection'
import { isScale, scales } from './scales'
import { seedBilling } from './steps/billing'
import { seedLeasing } from './steps/leasing'
import { seedMaintenance } from './steps/maintenance'
import { seedPortfolio } from './steps/portfolio'
import { seedReference } from './steps/reference'
import { analyzeAll, createIndexes, dropIndexes, resetSequences, setTriggers, truncateAll } from './maintenance'
import { buildWorld } from './world'

const flag = process.argv.indexOf('--scale')
const scale = flag === -1 ? 'small' : process.argv[flag + 1]
if (!isScale(scale)) throw new Error(`Unknown scale "${scale}", expected one of: ${Object.keys(scales).join(', ')}`)

const started = performance.now()
const step = async (name: string, run: () => Promise<unknown>) => {
  const before = performance.now()
  await run()
  console.log(`${name} (${((performance.now() - before) / 1000).toFixed(1)}s)`)
}

const world = buildWorld(scale)

// One connection for the load, with foreign keys, check and exclusion constraints on: an app's own role may not skip
// them (session_replication_role), only switch its triggers off, so the seed writes `paid_amount` itself. Postgres
// still refuses an overlapping lease or an overpaid charge; tests/examples/real-estate/smoke.test.ts checks the rest.
const loader = connect({ max: 1 })

await step('truncate', () => truncateAll(loader))
const indexes = await dropIndexes(loader)
await setTriggers(loader, false)
try {
  await step('reference', () => seedReference(loader, world))
  await step('portfolio', () => seedPortfolio(loader, world))
  await step('leasing', () => seedLeasing(loader, world))
  await step('billing', () => seedBilling(loader, world))
  await step('maintenance', () => seedMaintenance(loader, world))
} finally {
  await setTriggers(loader, true)
}
await loader.end()

const sql = connect({ max: 4 })
await step('indexes', () => createIndexes(sql, indexes))
await step('sequences', () => resetSequences(sql))
await sql`insert into public.seed_info (scale) values (${scale})`
await step('analyze', () => analyzeAll(sql))
await sql.end()

console.log(`seeded ${scale} in ${((performance.now() - started) / 1000).toFixed(1)}s`)
