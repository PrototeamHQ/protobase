import { convertedCronJobs, type PlannedCronJob } from './cron-plan'
import type { ImportManifest } from './import-state'

/** Protobase Cloud's Starter plan holds this much data; the import reports a larger database, it does not refuse it. */
const starterBytes = 500 * 1024 * 1024

const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`

const code = (text: string) => `\`${text.replaceAll('`', "'")}\``

const section = (title: string, intro: string, items: string[] | undefined, unreadable = 'The importing role could not read them; list them in the Supabase dashboard.') =>
  `## ${title}\n\n${items === undefined ? unreadable : items.length === 0 ? 'None.' : `${intro}\n\n${items.map((item) => `- ${item}`).join('\n')}`}\n`

const secretName = (secret: { name: string | null; description: string }) => `${secret.name ?? 'unnamed'}${secret.description ? `: ${secret.description}` : ''}`

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

const trigger = (one: ImportManifest['httpTriggers'][number]) => `${one.trigger} on ${one.schema}.${one.table}, calling ${one.function}`

const cronJob = (job: PlannedCronJob) => `${job.name ?? 'unnamed'}, ${code(job.schedule)}`

/** pg_cron's jobs the import scheduled again or made recurring jobs. */
const cronCarried = (jobs: PlannedCronJob[]) =>
  jobs.flatMap((job) => {
    if (job.outcome.kind === 'rescheduled') return [`pg_cron job ${cronJob(job)}${job.active ? '' : ', inactive'}`]
    if (job.outcome.kind === 'converted') return [`pg_cron job ${cronJob(job)}, as the recurring job ${code(`jobs/${job.outcome.file}.ts`)}`]
    return []
  })

/** pg_cron's jobs left for a person, each with why. */
const cronLeft = (jobs: PlannedCronJob[] | undefined) =>
  jobs?.flatMap((job) => (job.outcome.kind === 'left' ? [`${cronJob(job)}: ${code(job.command)}, ${job.outcome.reason}`] : []))

/** What a person does before the converted pg_cron jobs run, or nothing when the import converted none. */
const recurringJobs = (manifest: ImportManifest, jobsWired: boolean) => {
  if (convertedCronJobs(manifest.cronJobs).length === 0) return []
  const wiring = jobsWired ? '`protobase.config.ts` passes them as its `jobs`.' : '`protobase.config.ts` has a `jobs` of its own: add the exports of `jobs/index.ts` to it.'
  return [
    `## Recurring jobs\n\nThe import wrote pg_cron's jobs it could convert in \`jobs/\`, each running its SQL as the app's database role, once per time and without retries, as pg_cron did. ${wiring} They run once the database has the jobs schema: run \`protobase migration\` and apply it.\n`,
  ]
}

const tableName = (table: { schema: string; table: string }) => `${table.schema}.${table.table}`

/** The tables of the `supabase_realtime` publication the scaffold gave `.live()`, or nothing when it gave none. */
const liveTables = (live: string[]) => {
  if (live.length === 0) return []
  return [
    `## Live tables

The \`supabase_realtime\` publication sent these tables' changes to Realtime clients, so the scaffold gave each resource \`.live()\`. \`/api/sb/realtime/v1\` sends their \`postgres_changes\` once the database has the jobs schema, their capture triggers and the notices table: run \`protobase migration\` and apply it.

${live.map((table) => `- ${table}`).join('\n')}
`,
  ]
}

/** What the import made again through an extension's own API, or kept since the project's database runs the extension. */
const carried = (manifest: ImportManifest) => [
  ...cronCarried(manifest.cronJobs ?? []),
  ...(manifest.vaultReplayed ? (manifest.vaultSecrets ?? []).map((secret) => `Vault secret ${secretName(secret)}`) : []),
  ...(manifest.queuesReplayed ? (manifest.queues ?? []).filter((queue) => !queue.partitioned).map((queue) => `pgmq queue ${queue.name}, with ${plural(queue.messages, 'message')}`) : []),
  ...(manifest.httpSent ? manifest.httpTriggers.map((one) => `HTTP trigger ${trigger(one)}`) : []),
]

/** What pgmq's queues leave for a person: every queue without pgmq, and a partitioned queue's partitions with it. */
const queuesLeft = (manifest: ImportManifest) =>
  manifest.queues
    ?.filter((queue) => !manifest.queuesReplayed || queue.partitioned)
    .map((queue) => `${queue.name}${queue.partitioned ? ', partitioned' : ''}, with ${plural(queue.messages, 'message')}`)

/** What uses an extension Supabase dropped after Postgres 15, which a person converts. */
const conversions = (manifest: ImportManifest) => [
  ...manifest.hypertables.map((table) => `hypertable ${table.schema}.${table.table}, ${plural(table.rows, 'row')} in chunks the dump leaves out: make it a plain or pg_partman-partitioned table and copy its rows with \`INSERT … SELECT\``),
  ...manifest.routinesLeftOut.map((routine) => `function ${routine.name}, written in ${routine.language}: rewrite it in plpgsql or as a Protobase function`),
]

/**
 * The import's report: what it loaded, and what it could not carry over, for a person or their AI assistant to finish.
 * `doctor` is `protobase doctor`'s output on the scaffolded config, or `undefined` when there was no config to check;
 * `jobsWired` whether protobase.config.ts passes the pg_cron jobs the load wrote as its `jobs`; `live` the tables, as
 * `schema.table`, whose resources the scaffold gave `.live()`.
 */
export const importReport = (manifest: ImportManifest, doctor: string | undefined, jobsWired: boolean, live: string[]) =>
  [
    '# Supabase import\n',
    `Schemas ${manifest.schemas.join(', ')}, restored by the migration \`${manifest.migration}\`, and their data, loaded in one transaction.\n`,
    `The imported tables take ${megabytes(manifest.bytes)} in the source database${manifest.bytes > starterBytes ? `, more than the ${megabytes(starterBytes)} of the Starter plan: pick a larger plan` : `, within the ${megabytes(starterBytes)} of the Starter plan`}.\n`,
    `The migration leaves out ${manifest.leftOut} statement${manifest.leftOut === 1 ? '' : 's'} of the dump, as comments: grants to Supabase's own roles and the like.\n`,
    '## Rows loaded\n\nEach count matched the source before the load committed.\n\n| Table | Rows |\n| --- | --- |\n' +
      manifest.tables.map((table) => `| ${table.schema}.${table.table} | ${table.rows} |`).join('\n') +
      '\n',
    section(
      'Made again',
      "A dump cannot carry these. The load made Vault's secrets and pgmq's queues again through each extension's own API, in the same transaction, and scheduled pg_cron's jobs again with `cron.schedule` where the project's database has pg_cron; elsewhere the import made them the app's recurring jobs, on the same schedule. pg_net sends the HTTP triggers' calls from the project's database, Database Webhooks' through the `supabase_functions.http_request` the migration creates.",
      carried(manifest),
    ),
    ...recurringJobs(manifest, jobsWired),
    section('Cron jobs', 'These pg_cron jobs did not come over, each for the reason it gives. Make each a Protobase recurring job, or schedule it where the database has pg_cron.', cronLeft(manifest.cronJobs)),
    ...liveTables(live),
    section(
      'Realtime tables',
      "The `supabase_realtime` publication sends these tables' changes to Realtime clients, but the scaffold made no resource of them, such as for a table without a primary key or one in auth or storage, so `/api/sb/realtime/v1` refuses them. Give each a resource with `.live()` where the app listens to its changes.",
      manifest.realtimeTables.map(tableName).filter((table) => !live.includes(table)),
    ),
    section(
      'Vault secrets',
      "The project's database has no Vault, or the importing role could not read the secrets' values, so they stay in Supabase. Enter each again where the app reads it, such as an environment variable.",
      manifest.vaultReplayed ? [] : manifest.vaultSecrets?.map(secretName),
    ),
    section(
      'pgsodium encrypted columns',
      "pgsodium encrypts these columns with the Supabase project's root key, which never leaves Supabase, so the import copied their ciphertext as it is. Export each column's values decrypted in Supabase, from its decrypted view (`decrypted_<table>` beside the table unless the table's label names another), and write them over the ciphertext; then declare the field `.encrypted()` and run `protobase encryption apply`, which encrypts them with the app's own key.",
      manifest.pgsodiumColumns.map((column) => `${column.schema}.${column.table}.${column.column}`),
    ),
    section(
      'pgmq queues',
      "pgmq owns its queues' tables, so the dump leaves them out. Make each again with pgmq where the project's database has it, partitioned ones with `pgmq.create_partitioned`, and send its messages again.",
      queuesLeft(manifest),
    ),
    section(
      'Extensions left out',
      "The project's database does not let the importing role create these, so the migration does not. Replace what the app uses them for, or have the database's administrator make them available.",
      manifest.extensionsLeftOut.map((extension) => `${extension.name} (schema ${extension.schema})`),
    ),
    section(
      'To convert',
      'Supabase dropped timescaledb, plv8, plls and plcoffee after Postgres 15. The migration restores a hypertable as a plain table without its rows, and leaves out a function in a language the project\'s database does not have, as comments; convert each.',
      conversions(manifest),
    ),
    section(
      'HTTP triggers',
      "These triggers call out over HTTP with pg_net or a database webhook, and the project's database has no pg_net. The migration keeps a trigger calling the app's own function, but nothing sends; it leaves out a webhook's. Move each call to a Protobase event subscription or job.",
      manifest.httpSent ? [] : manifest.httpTriggers.map(trigger),
    ),
    "## Storage files\n\nThe load restored Storage's buckets and objects with their policies, but a dump holds no file bytes. Run `protobase import supabase --storage-url https://<ref>.supabase.co` with the project's secret key in `SUPABASE_SERVICE_ROLE_KEY` to copy them into the app's Storage file provider; it writes what it copied to `supabase-import/storage.md`, and a rerun copies what is left.\n",
    section(
      'Edge Functions',
      'The import converted `supabase/functions` into `functions/`. Each function answers at `/api/functions/<name>`, and at `/api/sb/functions/v1/<name>` for `supabase.functions.invoke`.',
      manifest.functions.converted.map((fn) => (fn.public ? `${fn.name}, public: \`verify_jwt = false\`` : fn.name)),
    ),
    section('Packages added', "The functions import these, which the import added to package.json's dependencies. Install them.", manifest.functions.packages.map((pkg) => `${pkg.name} ${code(pkg.range)}`)),
    section('Edge Function code to rewrite', "Node and Bun lack these, or no npm package has them. Rewrite each, by hand or with an AI assistant.", manifest.functions.left),
    `## Indexes the scan guard needs\n\n${doctor === undefined ? 'No resources were scaffolded, so `protobase doctor` had nothing to check.' : `\`protobase doctor\` on the scaffolded config. The API refuses a read that no index serves; add each index it names in a migration of its own.\n\n\`\`\`\n${doctor.trimEnd()}\n\`\`\``}\n`,
  ].join('\n')
