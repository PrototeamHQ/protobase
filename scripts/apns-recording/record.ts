// Records APNs's sandbox answers to the APNs sender: `bun run record:apns <topic>`, by hand only, with the APNs
// variables set, PROTOBASE_APNS_KEY, PROTOBASE_APNS_KEY_ID and PROTOBASE_APNS_TEAM_ID, and `<topic>` a bundle id of
// that team. It sends to a token of no device, once signed as the key is and once with another key id, so APNs answers
// for the device and for the provider token. It prints the files it wrote.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { apnsKeyIdVariable, apnsKeyVariable, apnsTeamIdVariable, readApnsSettings } from '../../packages/server/src/notifications/apns/apns-settings'
import { recordApns } from './apns-calls'
import { findLeak, secretsOf } from './scrub'

/** Where the APNs recordings live, next to the sender's tests. */
export const recordingDir = join(import.meta.dirname, '..', '..', 'packages', 'server', 'src', 'notifications', 'apns', 'snapshots')

/** A key id that is not the key's: APNs refuses the provider token it signs. */
export const otherKeyId = 'ZZZZZZZZZZ'

if (import.meta.main) {
  const topic = process.argv[2]
  if (!topic) throw new Error('Pass the bundle id to send to: bun run record:apns <topic>')
  const settings = readApnsSettings(process.env)
  if (!settings) throw new Error(`Set ${apnsKeyVariable}, ${apnsKeyIdVariable} and ${apnsTeamIdVariable} to record APNs's answers`)
  const secrets = secretsOf(process.env, [apnsKeyVariable, apnsKeyIdVariable, apnsTeamIdVariable])
  const recordings = {
    device: await recordApns(settings, topic),
    'provider-token': await recordApns({ ...settings, keyId: otherKeyId }, topic),
  }
  mkdirSync(recordingDir, { recursive: true })
  for (const [name, recording] of Object.entries(recordings)) {
    const path = join(recordingDir, `${name}.json`)
    const content = `${JSON.stringify(recording, null, 2)}\n`
    const leak = findLeak(content, secrets)
    if (leak) throw new Error(`Not written: ${path} would keep ${leak}`)
    writeFileSync(path, content)
    console.log(`wrote ${path}: ${recording.response.status}`)
  }
}
