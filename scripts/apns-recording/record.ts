// Records APNs's sandbox answers to the APNs sender: `bun run record:apns <topic> [device] [provider-token]`, by hand
// only, with the APNs variables set, PROTOBASE_APNS_KEY, PROTOBASE_APNS_KEY_ID and PROTOBASE_APNS_TEAM_ID, and
// `<topic>` a bundle id of that team. It sends to a token of no device: for `device` signed as the key is, so APNs
// answers for the device, and for `provider-token` with another key id, so APNs answers for the provider token; both
// without a name. It prints the files it wrote.
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
  const [topic, ...named] = process.argv.slice(2)
  if (!topic) throw new Error('Pass the bundle id to send to: bun run record:apns <topic> [device] [provider-token]')
  const cases = named.length > 0 ? named : ['device', 'provider-token']
  const unknown = cases.find((name) => name !== 'device' && name !== 'provider-token')
  if (unknown !== undefined) throw new Error(`${unknown} is none of device and provider-token`)
  const settings = readApnsSettings(process.env)
  if (!settings) throw new Error(`Set ${apnsKeyVariable}, ${apnsKeyIdVariable} and ${apnsTeamIdVariable} to record APNs's answers`)
  const secrets = secretsOf(process.env, [apnsKeyVariable, apnsKeyIdVariable, apnsTeamIdVariable])
  mkdirSync(recordingDir, { recursive: true })
  for (const name of cases) {
    const recording = await recordApns(name === 'device' ? settings : { ...settings, keyId: otherKeyId }, topic)
    const path = join(recordingDir, `${name}.json`)
    const content = `${JSON.stringify(recording, null, 2)}\n`
    const leak = findLeak(content, secrets)
    if (leak) throw new Error(`Not written: ${path} would keep ${leak}`)
    writeFileSync(path, content)
    console.log(`wrote ${path}: ${recording.response.status}`)
  }
}
