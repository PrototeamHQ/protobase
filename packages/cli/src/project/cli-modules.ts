import { fileURLToPath } from 'node:url'
import { cliTypePaths } from './project-types'

type BunRuntime = {
  plugin(plugin: { name: string; setup(build: { module(id: string, load: () => Promise<{ exports: Record<string, unknown>; loader: 'object' }>): void }): void }): void
  resolveSync(id: string, from: string): string
}

// The CLI's own package folder, from src/project in this repository and from dist/project when installed.
const cliDir = fileURLToPath(new URL('../..', import.meta.url))

/** Every entry point of the @protobase packages the CLI carries, such as `@protobase/server/pdf`. */
export const cliProtobaseIds = () => Object.keys(cliTypePaths()).filter((id) => id.startsWith('@protobase/'))

/**
 * Under Bun, makes every later import of an entry point of the @protobase packages load the CLI's own copy, whatever
 * the importer installed (Bun's virtual modules). Each loads when it is first imported, so the CLI loads nothing it did
 * not already load or the project does not import. Only the @protobase packages: a virtual module that loads lazily
 * cannot be `require`d, as the CLI requires React. Bun only: under Node the project's files load through Vite's module
 * runner, which resolves them from the CLI itself.
 */
export const provideCliModules = () => {
  const bun = (globalThis as unknown as { Bun?: BunRuntime }).Bun
  if (!bun) throw new Error('provideCliModules runs under Bun only')
  const ids = cliProtobaseIds()
  bun.plugin({
    name: 'protobase-cli-modules',
    setup: (build) => {
      for (const id of ids) build.module(id, async () => ({ exports: await import(bun.resolveSync(id, cliDir)), loader: 'object' }))
    },
  })
}
