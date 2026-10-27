import { fileURLToPath } from 'node:url'
import { cliTypePaths } from '../project/project-types'
import { hostModuleIds } from '../serve/host-module-ids'
import { provideHostModules } from '../serve/host-modules'

// Preloaded by `protobase run` into a bundled project's script, under Bun: its imports of the packages the serve
// runtime supplies get the CLI's own copies, as the runtime gives them to a bundle, and so does every other entry point
// of the @protobase packages, loaded when the script first imports it.

type BunRuntime = {
  plugin(plugin: { name: string; setup(build: { module(id: string, load: () => Promise<{ exports: Record<string, unknown>; loader: 'object' }>): void }): void }): void
  resolveSync(id: string, from: string): string
}

const bun = (globalThis as unknown as { Bun: BunRuntime }).Bun
const cliDir = fileURLToPath(new URL('../..', import.meta.url))

provideHostModules()

const others = Object.keys(cliTypePaths()).filter((id) => id.startsWith('@protobase/') && !(hostModuleIds as readonly string[]).includes(id))
bun.plugin({
  name: 'protobase-cli-modules',
  setup: (build) => {
    for (const id of others) build.module(id, async () => ({ exports: await import(bun.resolveSync(id, cliDir)), loader: 'object' }))
  },
})
