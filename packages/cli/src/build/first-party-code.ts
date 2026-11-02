import { firstPartyCodeKey } from '@protobase/schema/internal'
import { sentryVitePlugin } from '@sentry/vite-plugin'

/**
 * Marks every script of a browser build as the app's own (see `firstPartyCodeKey`), with the error SDK's bundler
 * plugin and nothing else of it: no release, no source map upload and no telemetry. Silent, since it still warns that
 * it has no token to create the release it is told not to create.
 */
export const firstPartyCode = () =>
  sentryVitePlugin({
    applicationKey: firstPartyCodeKey,
    telemetry: false,
    silent: true,
    sourcemaps: { disable: true },
    release: { inject: false, create: false, finalize: false, setCommits: false },
  })
