import { connect } from '../db/connection'
import { analyzeAll, createIndexes, dropIndexes, resetSequences, setTriggers, truncateAll } from './maintenance'
import { writePhotoLibrary } from './photos/library'
import { isScale, scales } from './scales'
import { seedMarket } from './steps/market'
import { seedMembers } from './steps/members'
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

let world: ReturnType<typeof buildWorld> | undefined
await step('build', async () => {
  world = buildWorld(scale)
})
let photos: Awaited<ReturnType<typeof writePhotoLibrary>>['photos'] | undefined
await step('photos', async () => {
  const library = await writePhotoLibrary()
  photos = library.photos
  console.log(`  in ${library.directory}`)
})

// One connection for the load, with foreign keys and checks on; only the publish trigger is off, since the seed
// writes the alerts its job would have recorded. tests/examples/property-portal/smoke.test.ts checks the rest.
const loader = connect({ max: 1 })
await step('truncate', () => truncateAll(loader))
const indexes = await dropIndexes(loader)
await setTriggers(loader, false)
try {
  await step('market', () => seedMarket(loader, world!, photos!))
  await step('members', () => seedMembers(loader, world!))
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
