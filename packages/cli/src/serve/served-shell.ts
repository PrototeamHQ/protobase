import { readShell } from '../build/shell'

/** The environment variable naming a shell folder for `protobase serve`, instead of the installed @protobase/ui's. */
export const shellVariable = 'PROTOBASE_SHELL'

/**
 * The shell a server of its own shell `ownDir` serves a bundle with: its own, so the app follows the server's version
 * without a rebuild, with the native packages it runs on in the mobile app when it names them; without one, the
 * bundle's copy.
 */
export const servedShell = async (ownDir: string | undefined): Promise<{ shell?: { dir: string; paths: string[] }; native?: Record<string, string>; note: string }> => {
  if (ownDir === undefined) return { note: "the bundle's copy of the app" }
  const own = await readShell(ownDir)
  return { shell: { dir: ownDir, paths: own.paths }, ...(own.native && { native: own.native }), note: `the app of Protobase ${own.protobase} from ${ownDir}` }
}
