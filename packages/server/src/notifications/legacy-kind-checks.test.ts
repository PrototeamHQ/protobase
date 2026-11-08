import { describe, expect, it } from 'vitest'
import { legacyKindChecks } from './legacy-kind-checks'

// Definitions as Postgres writes them for the checks the framework wrote, before and after relay devices.
const kinds = { name: 'devices_kind_check', def: "CHECK ((kind = ANY (ARRAY['web'::text, 'apns'::text, 'fcm'::text])))" }
const relayKinds = { name: 'devices_kind_check1', def: "CHECK ((kind = ANY (ARRAY['web'::text, 'apns'::text, 'fcm'::text, 'relay'::text])))" }
const fields = {
  name: 'devices_check',
  def: "CHECK ((((kind = 'web'::text) AND (p256dh IS NOT NULL)) OR ((kind = 'apns'::text) AND (environment IS NOT NULL)) OR ((kind = 'fcm'::text) AND (environment IS NULL))))",
}
const relayFields = { name: 'devices_check1', def: `${fields.def.slice(0, -2)} OR ((kind = 'relay'::text) AND (app_id IS NULL))))` }
const appOwn = { name: 'devices_no_fcm', def: "CHECK ((kind <> 'fcm'::text))" }

describe('legacyKindChecks', () => {
  it('names a check written before relay devices', () => {
    expect(legacyKindChecks([kinds])).toEqual(['devices_kind_check'])
  })

  it('names each legacy check when another already allows relay, and only those', () => {
    expect(legacyKindChecks([fields, relayKinds])).toEqual(['devices_check'])
    expect(legacyKindChecks([kinds, relayFields])).toEqual(['devices_kind_check'])
  })

  it('leaves the app\'s own checks alone', () => {
    expect(legacyKindChecks([appOwn, kinds])).toEqual(['devices_kind_check'])
  })

  it('names none when every check allows relay', () => {
    expect(legacyKindChecks([relayKinds, relayFields])).toEqual([])
    expect(legacyKindChecks([])).toEqual([])
  })
})
