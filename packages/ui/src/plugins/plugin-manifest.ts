/**
 * A plugin's plugin.json, as `protobase build-plugin` writes it: its name and own version, the plugin API and the
 * Protobase versions it is built for, and its module and stylesheet, as URLs relative to the plugin.json.
 */
export type PluginManifest = { name: string; version?: string; api: number; protobase: string; entry: string; css?: string }

export type ParsedManifest = { manifest: PluginManifest } | { problem: string }

const isText = (value: unknown): value is string => typeof value === 'string' && value.trim() !== ''

/** The manifest in `value`, or what is wrong with it. */
export const parseManifest = (value: unknown): ParsedManifest => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return { problem: 'its plugin.json is not an object' }
  const { name, version, api, protobase, entry, css } = value as Record<string, unknown>
  if (!isText(name)) return { problem: 'its plugin.json names no plugin' }
  if (!Number.isInteger(api)) return { problem: 'its plugin.json names no plugin API' }
  if (!isText(protobase)) return { problem: 'its plugin.json names no Protobase versions' }
  if (!isText(entry)) return { problem: 'its plugin.json names no module' }
  if (css !== undefined && !isText(css)) return { problem: 'its plugin.json names a stylesheet that is no URL' }
  if (version !== undefined && !isText(version)) return { problem: 'its plugin.json has a version that is no text' }
  return { manifest: { name, api: api as number, protobase, entry, ...(version !== undefined && { version }), ...(css !== undefined && { css }) } }
}
