import type { Plugin } from './types'

/** The version of this interface: releases add optional keys to it and never break it. */
export const pluginApi = 1

const pluginName = /^[a-z][a-z0-9_]*$/
const typeKey = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/

/** Declares a workflow plugin, checking its names: a type is `<name>:<key>`, such as `app:http` or `acme:new_order`. */
export const definePlugin = <const P extends Plugin>(plugin: P): P => {
  if (!pluginName.test(plugin.name)) throw new Error(`Workflow plugin "${plugin.name}": a plugin's name is lowercase letters, digits and "_"`)
  const keys = [...Object.keys(plugin.triggers ?? {}), ...Object.keys(plugin.steps ?? {})]
  const invalid = keys.find((key) => !typeKey.test(key))
  if (invalid !== undefined) throw new Error(`Workflow plugin "${plugin.name}": "${invalid}" is not a type key; use lowercase words joined by "_" or "."`)
  // A step and a trigger of one key would share the id `<name>:<key>`.
  const shared = Object.keys(plugin.steps ?? {}).find((key) => Object.hasOwn(plugin.triggers ?? {}, key))
  if (shared !== undefined) throw new Error(`Workflow plugin "${plugin.name}": "${shared}" is both a step and a trigger; give each type its own key`)
  const connections = Object.keys(plugin.connections ?? {})
  for (const [key, type] of [...Object.entries(plugin.triggers ?? {}), ...Object.entries(plugin.steps ?? {})]) {
    if (type.connection !== undefined && !connections.includes(type.connection)) throw new Error(`Workflow plugin "${plugin.name}": ${key} uses the connection "${type.connection}", which the plugin does not declare`)
  }
  return plugin
}
