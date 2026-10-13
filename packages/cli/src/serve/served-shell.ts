import { pluginProblem } from '@protobase/schema/internal'
import type { BundleLayout } from '../bundle/manifest'
import { readShell } from '../build/shell'

/** The environment variable naming a shell folder for `protobase serve`, instead of the installed @protobase/ui's. */
export const shellVariable = 'PROTOBASE_SHELL'

/**
 * The shell a server of its own shell `ownDir` serves a bundle with: its own, when every plugin of the bundle loads in
 * it, so the app follows the server's version without a rebuild; otherwise none, and the bundle's copy serves, with
 * the reason in `note`.
 */
export const servedShell = async (manifest: BundleLayout, ownDir: string | undefined): Promise<{ shell?: { dir: string; paths: string[] }; note: string }> => {
  if (ownDir === undefined) return { note: "the bundle's copy of the app" }
  const own = await readShell(ownDir)
  for (const plugin of manifest.plugins) {
    const problem = pluginProblem(plugin, { api: own.pluginApi, version: own.protobase })
    if (problem) return { note: `the bundle's copy of the app: its plugin ${plugin.name} would be off in the app of Protobase ${own.protobase}, since ${problem}` }
  }
  return { shell: { dir: ownDir, paths: own.paths }, note: `the app of Protobase ${own.protobase} from ${ownDir}` }
}
