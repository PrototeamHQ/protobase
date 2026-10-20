import type { CronJobToWrite } from './cron-plan'

const quoted = (text: string) => `'${text.replaceAll('\\', '\\\\').replaceAll("'", "\\'").replaceAll('\n', '\\n')}'`

const templateLiteral = (text: string) => `\`${text.replaceAll('\\', '\\\\').replaceAll('`', '\\`').replaceAll('${', '\\${')}\``

/**
 * The module of `jobs/` that runs a pg_cron job's SQL as a Protobase recurring job, on its schedule, as the app's
 * database role. pg_cron ran each time once, without retrying a failed one, so the job tries once too.
 */
export const cronJobModule = (job: CronJobToWrite) =>
  [
    "import { defineJob } from '@protobase/server'",
    "import { sql } from 'kysely'",
    '',
    `/** pg_cron's job ${job.name}, imported from Supabase: its SQL, on its schedule, tried once each time as pg_cron did. */`,
    `export const ${job.exportName} = defineJob({`,
    `  name: ${quoted(job.name)},`,
    `  schedule: ${quoted(job.schedule)},`,
    ...(job.timezone ? [`  timezone: ${quoted(job.timezone)},`] : []),
    '  maxAttempts: 1,',
    '  run: async (_, { db }) => {',
    `    await sql.raw(${templateLiteral(job.command)}).execute(db)`,
    '  },',
    '})',
    '',
  ].join('\n')
