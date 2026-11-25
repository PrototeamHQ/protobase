import path from 'node:path'

// `bun scripts/older-code/stamp-templates.ts <release checkout>`: marks the integration templates this checkout's
// `bun run test:db` built, from its migrations and sign-in steps, as current for the release checked out there, so that
// release's tests clone them instead of refusing them as stale. It writes the hash the release's own scripts/test-db
// computes from its sources as each template's comment, and changes nothing else in them.

const releaseDir = process.argv[2]
if (!releaseDir) throw new Error('Name the release checkout: bun scripts/older-code/stamp-templates.ts <dir>')

const testDb = path.resolve(releaseDir, 'scripts', 'test-db')
const { connectServer, sourceHash, suites, templates, templateServer } = await import(path.join(testDb, 'templates.ts'))
const { realPostgresTemplates, snapshotTemplates } = await import(path.join(testDb, 'snapshot-templates.ts'))

const stamped = [...suites.integration.map((key: string) => templates[key]), ...realPostgresTemplates.map((key: string) => snapshotTemplates[key])]
for (const template of stamped) {
  const sql = connectServer(15, templateServer(template))
  const [found] = await sql`select 1 from pg_database where datname = ${template.database}`
  if (!found) throw new Error(`${template.database} is missing: run bun run test:db in this checkout first`)
  await sql.unsafe(`comment on database "${template.database}" is '${await sourceHash(template)}'`)
  await sql.end()
  console.log(`stamped ${template.database} for ${releaseDir}`)
}
