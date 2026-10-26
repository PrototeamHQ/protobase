import type { CronJobToWrite } from './cron-plan'

const quoted = (text: string) => `'${text.replaceAll('\\', '\\\\').replaceAll("'", "\\'").replaceAll('\n', '\\n')}'`

const templateLiteral = (text: string) => `\`${text.replaceAll('\\', '\\\\').replaceAll('`', '\\`').replaceAll('${', '\\${')}\``

/**
 * What `jobs/<file>.ts` holds for a pg_cron job made a Protobase recurring job: its run, the job's SQL as the app's
 * database role. Its schedule is in protobase.config.ts (see `cronJobDeclaration`).
 */
export const cronJobModule = (job: CronJobToWrite) =>
  [
    "import { sql } from 'kysely'",
    "import type { JobRun } from '@protobase/server'",
    '',
    `/** pg_cron's job ${job.name}, imported from Supabase: its SQL, on the schedule protobase.config.ts declares. */`,
    'export default (async (_, { db }) => {',
    `  await sql.raw(${templateLiteral(job.command)}).execute(db)`,
    '}) satisfies JobRun',
    '',
  ].join('\n')

/**
 * The job's declaration in protobase.config.ts's `jobs`, as the text of one entry: pg_cron ran each time once, without
 * retrying a failed one, so the job tries once too.
 */
export const cronJobDeclaration = (job: CronJobToWrite) =>
  `${quoted(job.file)}: { description: ${quoted(`pg_cron's job ${job.name}, imported from Supabase.`)}, schedule: ${quoted(job.schedule)}, ${job.timezone ? `timezone: ${quoted(job.timezone)}, ` : ''}maxAttempts: 1 }`
