// Records the token endpoint's and FCM's answers with a service account: `bun run record:fcm`, by hand only, with
// PROTOBASE_FCM_SERVICE_ACCOUNT set to the key's JSON. It prints the files it wrote and, on a failure, the call and
// its status alone.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fcmServiceAccountVariable, readFcmSettings } from '../../packages/server/src/notifications/fcm/fcm-settings'
import { recordingsDir } from '../../packages/server/src/notifications/fcm/testing/recordings'
import { recordFcm } from './calls'
import { findFcmLeak, scrubRecording } from './scrub'

const text = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`

if (import.meta.main) {
  const settings = readFcmSettings(process.env)
  if (!settings) throw new Error(`Set ${fcmServiceAccountVariable} to record FCM's answers`)
  const { recordings, secrets } = await recordFcm(fetch, settings)
  const files = Object.entries(recordings).map(([name, recording]) => ({ path: join(recordingsDir, `${name}.json`), content: text(scrubRecording(recording, settings)) }))
  for (const { path, content } of files) {
    const leak = findFcmLeak(JSON.parse(content), secrets)
    if (leak) throw new Error(`Not written: ${path} would keep ${leak}`)
  }
  mkdirSync(recordingsDir, { recursive: true })
  for (const { path, content } of files) writeFileSync(path, content)
  for (const { path } of files) {
    if (findFcmLeak(JSON.parse(readFileSync(path, 'utf8')), secrets)) throw new Error(`${path} keeps a secret: restore it with git before committing`)
    console.log(`wrote ${path}`)
  }
}
