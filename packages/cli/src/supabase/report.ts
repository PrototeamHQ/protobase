import type { ImportManifest } from './import-state'

/** Protobase Cloud's Starter plan holds this much data; the import reports a larger database, it does not refuse it. */
const starterBytes = 500 * 1024 * 1024

const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`

const code = (text: string) => `\`${text.replaceAll('`', "'")}\``

const section = (title: string, intro: string, items: string[] | undefined, unreadable = 'The importing role could not read them; list them in the Supabase dashboard.') =>
  `## ${title}\n\n${items === undefined ? unreadable : items.length === 0 ? 'None.' : `${intro}\n\n${items.map((item) => `- ${item}`).join('\n')}`}\n`

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
      'Their values stay in Supabase. Enter each again where the app reads it, such as an environment variable.',
      manifest.vaultSecrets?.map((secret) => `${secret.name ?? 'unnamed'}${secret.description ? `: ${secret.description}` : ''}`),
    ),
    section(
      'Untrusted extensions',
      'Only a superuser may create these, so the migration does not. Replace what the app uses them for, or have the database\'s administrator create them.',
      manifest.untrustedExtensions.map((extension) => `${extension.name} (schema ${extension.schema})`),
    ),
    section(
      'HTTP triggers',
      "These triggers call out over HTTP with pg_net or a database webhook. The migration keeps a trigger calling the app's own function, but pg_net is not there to send; it leaves out a webhook's. Move each call to a Protobase event subscription or job.",
      manifest.httpTriggers.map((trigger) => `${trigger.trigger} on ${trigger.schema}.${trigger.table}, calling ${trigger.function}`),
    ),
    section('Edge Functions', '`supabase/functions` holds these, which the import does not convert.', manifest.functions),
    `## Indexes the scan guard needs\n\n${doctor === undefined ? 'No resources were scaffolded, so `protobase doctor` had nothing to check.' : `\`protobase doctor\` on the scaffolded config. The API refuses a read that no index serves; add each index it names in a migration of its own.\n\n\`\`\`\n${doctor.trimEnd()}\n\`\`\``}\n`,
  ].join('\n')
