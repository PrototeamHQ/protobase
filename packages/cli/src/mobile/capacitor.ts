import path from 'node:path'
import type { RunChild } from './child-process'
import { installedPackage } from './installed-package'

/** Runs a Capacitor command in the workspace. */
export type RunCapacitor = (args: string[]) => Promise<void>

/**
 * Runs the workspace's own Capacitor CLI, read from `<ws>/node_modules/@capacitor/cli` by path, so never one of the
 * project's or another found further up, with Node and the given environment.
 */
export const capacitorRunner = (ws: string, env: Record<string, string>, run: RunChild): RunCapacitor => async (args) => {
  const { name, bin } = installedPackage(ws, '@capacitor/cli')
  if (name !== '@capacitor/cli' || !bin?.cap) throw new Error(`${path.join(ws, 'node_modules', '@capacitor/cli')} is ${name}, not Capacitor's CLI`)
  await run('node', [path.join(ws, 'node_modules', '@capacitor', 'cli', bin.cap), ...args], { cwd: ws, env })
}
