import type { Queue, VaultSecret } from './source-facts'

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
 * The psql script that makes again, through each extension's own API, what a dump cannot carry over: Vault's secrets,
 * whose ciphertext only Supabase's key opens, and pgmq's queues, whose tables belong to the extension. It holds the
 * secrets' values, so it lives only in `supabase-import/`, readable by its owner, until the load deletes it.
 */
export const replayScript = (input: { secrets: VaultSecret[]; queues: Queue[] }) => secretsScript(input.secrets) + input.queues.map(queueScript).join('')
