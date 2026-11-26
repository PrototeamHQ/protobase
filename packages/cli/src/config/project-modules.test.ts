import { describe, expect, it } from 'vitest'
import type { ProtobaseConfig } from '@protobase/config'
import { f, resource } from '@protobase/schema'
import { mergeConfig } from './merge-config'
import type { ProjectFiles } from './project-files'
import { configModules } from './project-modules'

const tickets = resource('tickets').table('tickets').fields({ id: f.integer() }).primaryKey((r) => r.id)

const files: ProjectFiles = {
  resources: async () => ({ tickets }),
  functions: {},
  module: () => undefined,
  folder: () => [],
  package: () => Promise.reject(new Error('no packages')),
}

const modules = async (config: ProtobaseConfig) => Object.keys(await configModules(mergeConfig({ config: { name: 'app', assistant: false, ...config }, files, label: 'app' })))

describe('configModules', () => {
  it("writes the query module with the MCP endpoint's sql and no assistant", async () => {
    expect(await modules({ auth: { mcp: true }, mcpEndpoint: { sql: true } })).toContain('query')
    expect(await modules({ auth: { mcp: true }, mcpEndpoint: {} })).not.toContain('query')
  })
})
