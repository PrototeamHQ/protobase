import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { PushMessage } from '../../message'

/**
 * One answer of Google's token endpoint or FCM, as a file under `recordings/<name>.json`: the request the sender made
 * and the answer. `stand_in` is true for an answer written by hand in the format a recording writes. A recording never
 * keeps a credential: the assertion, the access token and the bearer hold placeholders `snapshot-<field>-<n>`, and the
 * project and service account are the placeholders below, which `loadRecording` checks.
 */
export type FcmRecording = {
  stand_in: boolean
  recorded_at: string | null
  request: { method: string; url: string; headers: Record<string, string>; body: Record<string, unknown> }
  response: { status: number; headers: Record<string, string>; body: unknown }
}

export const recordingsDir = join(import.meta.dirname, 'recordings')

/** The project and service account a recording names in place of the real ones. */
export const projectPlaceholder = 'example-project'
export const clientEmailPlaceholder = 'fcm-sender@example.com'

/** A device token made up for the recording, in an FCM token's format: FCM answers it as unregistered. */
export const madeUpDeviceToken = `cRecordingToken0:APA91b${'Recording0'.repeat(14)}`

/** The message the send recordings carry, with every field the sender maps and `platform.fcm` fields. */
export const recordedMessage: PushMessage = {
  title: 'Task assigned',
  body: 'Review the plan',
  url: 'https://app.example.com/tasks/1',
  data: { task: 1, kind: 'assigned' },
  badge: 3,
  sound: 'default',
  tag: 'task-1',
  ttl: 600,
  urgency: 'high',
  platform: { fcm: { android: { notification: { channel_id: 'tasks', color: '#3366ff' } }, fcm_options: { analytics_label: 'tasks' } } },
}

const placeholder = /^snapshot-[a-z_]+-\d+$/

/** `recording`, refused when a credential field holds anything but its placeholder or it names another project. */
export const checkedRecording = (recording: FcmRecording, name: string) => {
  const { request, response } = recording
  const fields = [request.body.assertion, request.headers.authorization?.replace(/^Bearer /, ''), (response.body as { access_token?: unknown } | null)?.access_token]
  for (const value of fields) if (value !== undefined && (typeof value !== 'string' || !placeholder.test(value))) throw new Error(`Recording ${name}: a credential is not a placeholder snapshot-<field>-<n>`)
  if (/-----BEGIN|ya29\./.test(JSON.stringify(recording))) throw new Error(`Recording ${name} holds a key or a token`)
  return recording
}

/** The recording `name`, checked. */
export const loadRecording = (name: string): FcmRecording => checkedRecording(JSON.parse(readFileSync(join(recordingsDir, `${name}.json`), 'utf8')) as FcmRecording, name)

/** The names of every committed recording. */
export const recordingNames = () => readdirSync(recordingsDir).filter((file) => file.endsWith('.json')).map((file) => file.slice(0, -'.json'.length))
