import { connect } from '../db/connection'
import { isScale, scales } from './scales'
import { seedBilling } from './steps/billing'
import { seedLeasing } from './steps/leasing'
import { seedMaintenance } from './steps/maintenance'
import { seedPortfolio } from './steps/portfolio'
import { seedReference } from './steps/reference'
import { analyzeAll, createIndexes, dropIndexes, resetSequences, truncateAll } from './maintenance'
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

// One connection: replica role skips foreign key and other triggers during the load. Check and exclusion constraints
// still apply, so Postgres itself refuses an overlapping lease or an overpaid charge; tests/examples/real-estate/smoke.test.ts checks the rest.
const loader = connect({ max: 1 })
await loader`set session_replication_role = replica`

await step('truncate', () => truncateAll(loader))
const indexes = await dropIndexes(loader)
await step('reference', () => seedReference(loader, world))
await step('portfolio', () => seedPortfolio(loader, world))
await step('leasing', () => seedLeasing(loader, world))
await step('billing', () => seedBilling(loader, world))
await step('maintenance', () => seedMaintenance(loader, world))
await loader.end()

const sql = connect({ max: 4 })
await step('indexes', () => createIndexes(sql, indexes))
await step('sequences', () => resetSequences(sql))
await sql`insert into public.seed_info (scale) values (${scale})`
await step('analyze', () => analyzeAll(sql))
await sql.end()

console.log(`seeded ${scale} in ${((performance.now() - started) / 1000).toFixed(1)}s`)
