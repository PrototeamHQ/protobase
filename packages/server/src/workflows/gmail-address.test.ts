import { gmailPlugin } from '@protobase/workflow-plugins'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fakeGmail } from '../../../../test-support/fake-gmail/fake-gmail'
import { fakeConnection } from '../../../../test-support/fake-gmail/trigger-context'
import { pluginFetch } from './plugin-fetch'

describe("the Gmail plugin through the server's fetch", () => {
  const gmail = fakeGmail()
  let served: Awaited<ReturnType<typeof gmail.serve>>
  beforeAll(async () => void (served = await gmail.serve()))
  afterAll(() => served.close())

  const start = (allowPrivateAddresses: boolean) =>
    gmailPlugin({ apiUrl: served.url }).triggers.new_mail.start({ input: {}, connection: fakeConnection('token-1'), fetch: pluginFetch({ allowPrivateAddresses }), signal: new AbortController().signal })

  it('sends no token to this machine unless the app allows private addresses, for development and tests', async () => {
    await expect(start(false)).rejects.toThrow('Gmail labels.list failed: AddressRefusedError')
    expect(gmail.calls).toEqual([])
    await expect(start(true)).resolves.toMatchObject({ label_id: 'INBOX', history_id: gmail.historyId })
    expect(gmail.calls.map(({ path }) => path)).toEqual(['labels', 'profile'])
  })
})
