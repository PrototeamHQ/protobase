// The serve runtime the launcher carries, run as the launcher's own child processes. It keeps the app's files (workflow
// traces among them) under data/ of its working folder, the home folder.
import { spawn, spawnSync } from 'node:child_process'

export type RuntimeEnv = Record<string, string>

/** Runs `migrate` or `create-admin` to the end, failing with its output. */
export const runRuntime = (home: string, args: string[], env: RuntimeEnv, input?: string) => {
  const result = spawnSync(process.execPath, args, { cwd: home, env: { ...process.env, ...env }, input, stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'], encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`${args[0]} failed:\n${result.stdout}${result.stderr}`)
  return result.stdout
}

/** Starts `serve` in the background; its errors show in the launcher's window. */
export const serveRuntime = (home: string, appDir: string, env: RuntimeEnv) => spawn(process.execPath, ['serve', appDir], { cwd: home, env: { ...process.env, ...env }, stdio: ['ignore', 'ignore', 'inherit'] })

/** Waits until `base` answers at all, for at most 30 seconds. */
export const waitUntilServing = async (base: string) => {
  for (let i = 0; i < 120; i++) {
    const status = await fetch(`${base}/api/meta`).then((response) => response.status, () => 0)
    if (status !== 0) return
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`the app did not answer at ${base} within 30 seconds`)
}
