import type { PluginCapabilities } from '@protobase/schema/internal'
import { text } from './messages'

/**
 * A plugin's plugin.json, as `protobase build-plugin` writes it: its name and own version, the plugin API it is built
 * for, what it uses from Protobase (see `PluginCapabilities`), the Protobase versions its author names, if any, and its
 * module and stylesheet, as URLs relative to the plugin.json.
 */
export type PluginManifest = PluginCapabilities & { name: string; version?: string; api: number; protobase?: string; entry: string; css?: string }

export type ParsedManifest = { manifest: PluginManifest } | { problem: string }

const isText = (value: unknown): value is string => typeof value === 'string' && value.trim() !== ''

const isNames = (value: unknown): value is string[] => Array.isArray(value) && value.every(isText)

const isImports = (value: unknown): value is Record<string, string[]> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && Object.values(value).every(isNames)

/** The manifest in `value`, or what is wrong with it. */
export const parseManifest = (value: unknown): ParsedManifest => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return { problem: text('notObject') }
  const { name, version, api, protobase, imports, extensionPoints, entry, css } = value as Record<string, unknown>
  if (!isText(name)) return { problem: text('noName') }
  if (!Number.isInteger(api)) return { problem: text('noApi') }
  if (protobase !== undefined && !isText(protobase)) return { problem: text('badVersions') }
  if (!isImports(imports) || !isNames(extensionPoints)) return { problem: text('noUses') }
  if (!isText(entry)) return { problem: text('noModule') }
  if (css !== undefined && !isText(css)) return { problem: text('badStylesheet') }
  if (version !== undefined && !isText(version)) return { problem: text('badVersion') }
  return {
    manifest: {
      name,
      api: api as number,
      imports,
      extensionPoints,
      entry,
      ...(protobase !== undefined && { protobase }),
      ...(version !== undefined && { version }),
      ...(css !== undefined && { css }),
    },
  }
}
