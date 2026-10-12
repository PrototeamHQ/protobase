import type { BundleLayout } from '../bundle/manifest'

/** What the API serves of a bundle's UI: the plugins it carries, as plugin.json paths on the app's origin. */
export type BundleUi = { plugins: string[] }

export const bundleUi = (manifest: BundleLayout): BundleUi => ({ plugins: manifest.plugins.map((plugin) => `/${plugin.path}`) })
