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

/** What the import made again through an extension's own API, or kept since the project's database runs the extension. */
const carried = (manifest: ImportManifest) => [
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
 * `doctor` is `protobase doctor`'s output on the scaffolded config, or `undefined` when there was no config to check.
 */
export const importReport = (manifest: ImportManifest, doctor: string | undefined) =>
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
      "A dump cannot carry these. The load made Vault's secrets and pgmq's queues again through each extension's own API, in the same transaction, and pg_net sends the HTTP triggers' calls from the project's database, Database Webhooks' through the `supabase_functions.http_request` the migration creates.",
      carried(manifest),
    ),
    section(
      'Cron jobs',
      "pg_cron's jobs live in its own schema, which the import does not carry over. Recreate each as a Protobase job with a schedule.",
      manifest.cronJobs?.map((job) => `${job.name ?? 'unnamed'}, ${code(job.schedule)}: ${code(job.command)}`),
    ),
    section(
      'Realtime tables',
      'The `supabase_realtime` publication sends these tables\' changes to Realtime clients. Give each the live updates the app needs.',
      manifest.realtimeTables.map((table) => `${table.schema}.${table.table}`),
    ),
    section(
      'Vault secrets',
      "The project's database has no Vault, or the importing role could not read the secrets' values, so they stay in Supabase. Enter each again where the app reads it, such as an environment variable.",
      manifest.vaultReplayed ? [] : manifest.vaultSecrets?.map(secretName),
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
    section('Edge Functions', '`supabase/functions` holds these, which the import does not convert.', manifest.functions),
    `## Indexes the scan guard needs\n\n${doctor === undefined ? 'No resources were scaffolded, so `protobase doctor` had nothing to check.' : `\`protobase doctor\` on the scaffolded config. The API refuses a read that no index serves; add each index it names in a migration of its own.\n\n\`\`\`\n${doctor.trimEnd()}\n\`\`\``}\n`,
  ].join('\n')
