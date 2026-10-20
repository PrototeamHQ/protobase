import type { CronJob, Queue, VaultSecret } from './source-facts'

const literal = (text: string | null) => (text === null ? 'NULL' : `'${text.replaceAll("'", "''")}'`)

const jsonb = (text: string | null) => `${literal(text)}::jsonb`

/** Vault's secrets, made again with their values: Vault encrypts them with the project database's own key. */
const secretsScript = (secrets: VaultSecret[]) =>
  secrets.map((secret) => `SELECT vault.create_secret(${literal(secret.secret)}, ${literal(secret.name)}, ${literal(secret.description)});\n`).join('')

/** A queue, made again as it was, and its messages sent again in order, each with its headers and visibility time. */
const queueScript = (queue: Queue) =>
  [
    `SELECT pgmq.${queue.unlogged ? 'create_unlogged' : 'create'}(${literal(queue.name)});\n`,
    ...queue.messages.map((message) => `SELECT pgmq.send(${literal(queue.name)}, ${jsonb(message.message)}, ${jsonb(message.headers)}, ${literal(message.visibleAt)}::timestamptz);\n`),
  ].join('')

/**
 * A pg_cron job, scheduled again as it was, by the importing role, which runs it as Supabase's `postgres` did; an
 * inactive one stays inactive.
 */
const cronScript = (job: CronJob) => {
  const schedule = `cron.schedule(${job.name === null ? '' : `${literal(job.name)}, `}${literal(job.schedule)}, ${literal(job.command)})`
  return `SELECT ${job.active ? schedule : `cron.alter_job(${schedule}, active => false)`};\n`
}

/**
 * The psql script that makes again, through each extension's own API, what a dump cannot carry over: Vault's secrets,
 * whose ciphertext only Supabase's key opens, pgmq's queues, whose tables belong to the extension, and pg_cron's jobs,
 * which live in its own schema. It holds the secrets' values, so it lives only in `supabase-import/`, readable by its owner, until the load deletes it.
 */
export const replayScript = (input: { secrets: VaultSecret[]; queues: Queue[]; cronJobs: CronJob[] }) =>
  secretsScript(input.secrets) + input.queues.map(queueScript).join('') + input.cronJobs.map(cronScript).join('')
