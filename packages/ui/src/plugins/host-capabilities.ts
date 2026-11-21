import * as react from 'react'
import * as reactDom from 'react-dom'
import * as jsxRuntime from 'react/jsx-runtime'
import type { PluginCapabilities } from '@protobase/schema/internal'
import pinned from './plugin-api.exports.json' with { type: 'json' }
import { pluginExtensionPoints } from './extension-points'

/**
 * What this app provides to plugins: every name of each module it shares with them, the exports of @protobase/ui as
 * plugin-api.test.ts pins them, and the extension points it reads.
 */
export const hostCapabilities: PluginCapabilities = {
  imports: {
    react: Object.keys(react),
    'react/jsx-runtime': Object.keys(jsxRuntime),
    'react-dom': Object.keys(reactDom),
    '@protobase/ui': pinned.exports,
  },
  extensionPoints: pluginExtensionPoints,
}
