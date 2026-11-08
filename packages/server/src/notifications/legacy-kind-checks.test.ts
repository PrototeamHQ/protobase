import { describe, expect, it } from 'vitest'
import { legacyKindChecks } from './legacy-kind-checks'
import { notificationsNames } from './options'

const { columns } = notificationsNames()

// Definitions as Postgres writes them for the checks the framework wrote, before and after relay devices.
const kinds = { name: 'devices_kind_check', def: "CHECK ((kind = ANY (ARRAY['web'::text, 'apns'::text, 'fcm'::text])))" }
const relayKinds = { name: 'devices_kind_check1', def: "CHECK ((kind = ANY (ARRAY['web'::text, 'apns'::text, 'fcm'::text, 'relay'::text])))" }
const fieldsDef =
  "CHECK ((((kind = 'web'::text) AND (p256dh IS NOT NULL) AND (auth IS NOT NULL) AND (environment IS NULL) AND (app_id IS NULL))" +
  " OR ((kind = 'apns'::text) AND (p256dh IS NULL) AND (auth IS NULL) AND (environment IS NOT NULL) AND (app_id IS NOT NULL))" +
  " OR ((kind = 'fcm'::text) AND (p256dh IS NULL) AND (auth IS NULL) AND (environment IS NULL))))"
const fields = { name: 'devices_check', def: fieldsDef }
const relayFields = { name: 'devices_check1', def: `${fieldsDef.slice(0, -2)} OR ((kind = 'relay'::text) AND (p256dh IS NULL) AND (auth IS NULL) AND (environment IS NULL) AND (app_id IS NULL))))` }
const appOwn = { name: 'devices_no_fcm', def: "CHECK ((kind <> 'fcm'::text))" }
// The app's own check that lists the legacy kinds and restricts more: refusing it would lose the token rule.
const appKindsAndToken = { name: 'devices_kinds_token', def: "CHECK (((kind = ANY (ARRAY['web'::text, 'apns'::text, 'fcm'::text])) AND (token <> ''::text)))" }

describe('legacyKindChecks', () => {
  it('names a check written before relay devices', () => {
    expect(legacyKindChecks([kinds], columns)).toEqual(['devices_kind_check'])
    expect(legacyKindChecks([fields], columns)).toEqual(['devices_check'])
  })

  it('names each legacy check when another already allows relay, and only those', () => {
    expect(legacyKindChecks([fields, relayKinds], columns)).toEqual(['devices_check'])
    expect(legacyKindChecks([kinds, relayFields], columns)).toEqual(['devices_kind_check'])
  })

  it("leaves the app's own checks alone, even one that lists the legacy kinds and restricts more", () => {
    expect(legacyKindChecks([appOwn, kinds], columns)).toEqual(['devices_kind_check'])
    expect(legacyKindChecks([appKindsAndToken], columns)).toEqual([])
  })

  it('names none when every check allows relay', () => {
    expect(legacyKindChecks([relayKinds, relayFields], columns)).toEqual([])
    expect(legacyKindChecks([], columns)).toEqual([])
  })

  it('reads the columns under the names the table gives them, quoted where Postgres needs to', () => {
    const renamed = { ...columns, kind: 'Kind' }
    const quoted = { name: 'devices_kind_check', def: `CHECK (("Kind" = ANY (ARRAY['web'::text, 'apns'::text, 'fcm'::text])))` }
    expect(legacyKindChecks([quoted], renamed)).toEqual(['devices_kind_check'])
    expect(legacyKindChecks([kinds], renamed)).toEqual([])
  })
})
