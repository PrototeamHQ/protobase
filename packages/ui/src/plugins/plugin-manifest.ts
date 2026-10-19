import { text } from './messages'

/**
 * A plugin's plugin.json, as `protobase build-plugin` writes it: its name and own version, the plugin API and the
 * Protobase versions it is built for, and its module and stylesheet, as URLs relative to the plugin.json.
 */
export type PluginManifest = { name: string; version?: string; api: number; protobase: string; entry: string; css?: string }

export type ParsedManifest = { manifest: PluginManifest } | { problem: string }

const isText = (value: unknown): value is string => typeof value === 'string' && value.trim() !== ''

/** The manifest in `value`, or what is wrong with it. */
export const parseManifest = (value: unknown): ParsedManifest => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return { problem: text('notObject') }
  const { name, version, api, protobase, entry, css } = value as Record<string, unknown>
  if (!isText(name)) return { problem: text('noName') }
  if (!Number.isInteger(api)) return { problem: text('noApi') }
  if (!isText(protobase)) return { problem: text('noVersions') }
  if (!isText(entry)) return { problem: text('noModule') }
  if (css !== undefined && !isText(css)) return { problem: text('badStylesheet') }
  if (version !== undefined && !isText(version)) return { problem: text('badVersion') }
  return { manifest: { name, api: api as number, protobase, entry, ...(version !== undefined && { version }), ...(css !== undefined && { css }) } }
}
