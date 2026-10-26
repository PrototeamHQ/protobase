import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const server = '@protobase/server'

// The framework packages the CLI ships, which a project that does not list @protobase/server gets from the CLI too.
const framework = ['@protobase/layout', '@protobase/query', '@protobase/schema', server]

const dependencyFields = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'] as const

// The CLI's own package folder, from src/dev in this repository and from dist/dev when installed.
const cliDir = fileURLToPath(new URL('../..', import.meta.url))

export type ServerPackage = {
  from: 'project' | 'cli'
  /** The folder Vite resolves the `dedupe` packages from, for the project's files and the CLI's alike. */
  root: string
  dedupe: string[]
}

/**
 * Where the API of `protobase dev` gets @protobase/server: from the project's node_modules when its package.json lists
 * it, so a project that is not installed fails as any missing package does; otherwise, with no package.json or one
 * without it, the CLI's own, with the CLI's other framework packages.
 */
export const serverPackage = (projectDir: string, ownDir = cliDir): ServerPackage => {
  const file = path.join(projectDir, 'package.json')
  const manifest: Partial<Record<(typeof dependencyFields)[number], Record<string, string>>> = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
  if (dependencyFields.some((field) => manifest[field]?.[server] !== undefined)) return { from: 'project', root: projectDir, dedupe: [server] }
  return { from: 'cli', root: ownDir, dedupe: framework }
}
