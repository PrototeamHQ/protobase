import type { ConnectionDeclaration, Plugin } from './types'

/** The version of this interface: releases add optional keys to it and never break it. */
export const pluginApi = 1

const pluginName = /^[a-z][a-z0-9_]*$/
const typeKey = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/
const connectionName = /^[a-z][a-z0-9_]*$/
const localHosts = ['localhost', '127.0.0.1', '[::1]']

// An endpoint a connection declares: https, or http on this machine only, for a provider a test runs.
const endpointProblem = (value: unknown) => {
  if (typeof value !== 'string' || !URL.canParse(value)) return 'is not a URL'
  const url = new URL(value)
  if (url.protocol === 'https:' || (url.protocol === 'http:' && localHosts.includes(url.hostname))) return
  return 'must be an https URL'
}

const checkConnection = (where: string, name: string, connection: ConnectionDeclaration) => {
  if (!connectionName.test(name)) throw new Error(`${where}: "${name}" is not a connection name; use lowercase letters, digits and "_"`)
  const urls = 'oauth' in connection ? { ...connection.oauth } : { revocation_url: connection.revocation_url }
  for (const [field, value] of Object.entries(urls)) {
    if (field === 'pkce' || value === undefined) continue
    const problem = endpointProblem(value)
    if (problem) throw new Error(`${where}: the connection "${name}"'s ${field} ${problem}`)
  }
}

/** Throws when `plugin` breaks a naming rule, each error starting with `where`. */
export const checkPlugin = (plugin: Plugin, where = `Workflow plugin "${plugin.name}"`) => {
  if (!pluginName.test(plugin.name)) throw new Error(`${where}: a plugin's name is lowercase letters, digits and "_"`)
  const keys = [...Object.keys(plugin.triggers ?? {}), ...Object.keys(plugin.steps ?? {})]
  const invalid = keys.find((key) => !typeKey.test(key))
  if (invalid !== undefined) throw new Error(`${where}: "${invalid}" is not a type key; use lowercase words joined by "_" or "."`)
  // A step and a trigger of one key would share the id `<name>:<key>`.
  const shared = Object.keys(plugin.steps ?? {}).find((key) => Object.hasOwn(plugin.triggers ?? {}, key))
  if (shared !== undefined) throw new Error(`${where}: "${shared}" is both a step and a trigger; give each type its own key`)
  const connections = Object.keys(plugin.connections ?? {})
  for (const [name, connection] of Object.entries(plugin.connections ?? {})) checkConnection(where, name, connection)
  for (const [key, type] of [...Object.entries(plugin.triggers ?? {}), ...Object.entries(plugin.steps ?? {})]) {
    if (type.connection !== undefined && !connections.includes(type.connection)) throw new Error(`${where}: ${key} uses the connection "${type.connection}", which the plugin does not declare`)
  }
}

/** Declares a workflow plugin, checking its names: a type is `<name>:<key>`, such as `app:http` or `acme:new_order`. */
export const definePlugin = <const P extends Plugin>(plugin: P): P => {
  checkPlugin(plugin)
  return plugin
}
