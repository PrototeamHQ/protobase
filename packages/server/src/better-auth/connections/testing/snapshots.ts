import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * One answer of a provider, as a file under `snapshots/<provider>/<answer>.json`: the request it answers (method, URL
 * and the names of its form fields) and the response. `stand_in` is true for an answer written by hand in the format a
 * recording writes, false once recorded from the provider. A recording never keeps a live token: every token field
 * holds a placeholder `snapshot-<field>-<n>`, which `loadSnapshot` checks.
 */
export type Snapshot = {
  stand_in: boolean
  recorded_at: string | null
  request: { method: string; url: string; form: string[] }
  response: { status: number; headers: Record<string, string>; body: Record<string, unknown> }
}

const tokenFields = ['access_token', 'refresh_token', 'id_token', 'token']
const placeholder = /^snapshot-[a-z_]+-\d+$/

/** `snapshot`, refused when a token field holds anything but its placeholder. */
export const checkedSnapshot = (snapshot: Snapshot, name: string) => {
  for (const field of tokenFields) {
    const value = snapshot.response.body[field]
    if (value !== undefined && (typeof value !== 'string' || !placeholder.test(value))) throw new Error(`Snapshot ${name}: ${field} must be a placeholder snapshot-${field}-<n>, never a recorded token`)
  }
  return snapshot
}

/** The snapshot `answer` of `provider`, checked. */
export const loadSnapshot = (provider: string, answer: string): Snapshot =>
  checkedSnapshot(JSON.parse(readFileSync(join(import.meta.dirname, 'snapshots', provider, `${answer}.json`), 'utf8')) as Snapshot, `${provider}/${answer}`)
