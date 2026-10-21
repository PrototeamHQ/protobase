import type { AppIcons } from '@protobase/server'
import type { BundleLayout } from '../bundle/manifest'

/**
 * What the API serves of a bundle's UI: the plugins it carries, as plugin.json paths on the app's origin, the field
 * types they register with the storage types each shows, which the views are checked against at startup, and which of
 * its icons are the project's own.
 */
export type BundleUi = { plugins: string[]; fieldTypes: Record<string, string[]>; icons?: AppIcons }

export const bundleUi = (manifest: BundleLayout): BundleUi => ({
  plugins: manifest.plugins.map((plugin) => `/${plugin.path}`),
  fieldTypes: Object.fromEntries(manifest.plugins.flatMap((plugin) => Object.entries(plugin.fields ?? {}))),
  ...(manifest.icons && { icons: manifest.icons }),
})
