import { chromium, firefox, type Browser } from 'playwright'
import { callsSchemaSql } from '../../../packages/server/src/calls/calls-sql'
import { openPostgresDatabase } from '../../../test-support/postgres-database'
import { bundleBrowserClient } from '../../e2e/support/bundle-client'

/** The browsers the calls' contract runs in. */
export const callBrowsers = ['chromium', 'firefox'] as const
export type CallBrowser = (typeof callBrowsers)[number]

/**
 * The browser, with fake devices for the camera and microphone, and, in Firefox, the loopback addresses the members'
 * browsers on this machine reach each other through, unhidden.
 */
export const launchCallBrowser = (name: CallBrowser): Promise<Browser> =>
  name === 'chromium'
    ? chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] })
    : firefox.launch({
        firefoxUserPrefs: {
          'media.navigator.streams.fake': true,
          'media.navigator.permission.disabled': true,
          'media.autoplay.default': 0,
          'media.peerconnection.ice.loopback': true,
          'media.peerconnection.ice.obfuscate_host_addresses': false,
        },
      })

/** A clone of the empty test template with the `calls` schema; closed by the caller. */
export const callsDatabase = async () => {
  const database = await openPostgresDatabase('empty')
  await database.exec(`${callsSchemaSql};`)
  return database
}

/** The member's page, as an app serves it, with @protobase/client/calls bundled. */
export const callPage = async () => ({
  html: '<!doctype html><title>Call</title><script type="module" src="/client.js"></script>',
  script: await bundleBrowserClient('../../calls/support/call-page.ts'),
})
