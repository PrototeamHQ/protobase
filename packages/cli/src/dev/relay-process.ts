import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer, type AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { devHost } from './loopback'

export type RelayProcess = {
  /** Ends the relay and removes its apps file. */
  stop: () => Promise<void>
}

/** The address of a relay on the loopback's `port`. */
export const relayUrl = (port: number) => `http://${devHost}:${port}`

/** A port free on the loopback now, which the relay listens on next: the relay cannot report a port of its own choosing. */
export const freePort = async () => {
  const server = createServer()
  server.listen(0, devHost)
  await once(server, 'listening')
  const { port } = server.address() as AddressInfo
  server.close()
  await once(server, 'close')
  return port
}

/**
 * Starts the relay `binary` on the loopback's `port`, serving the one app of `entry` from an apps file in a folder of
 * its own. Its output goes to the terminal; `onExit` hears of a relay that ends other than through `stop`. The relay
 * gets no other environment than its two variables, and is killed when this process exits.
 */
export const startRelay = async (binary: string, port: number, entry: object, onExit: (code: number | null) => void): Promise<RelayProcess> => {
  const dir = await mkdtemp(path.join(tmpdir(), 'protobase-relay-'))
  const appsFile = path.join(dir, 'apps.json')
  await writeFile(appsFile, JSON.stringify({ apps: [entry] }), { mode: 0o600 })
  // A process group of its own, as the API process is left out of Ctrl-C: the terminal's SIGINT reaches the dev server,
  // which stops the relay itself, so a relay ending on its own is always news.
  const child = spawn(binary, [], { env: { PROTOBASE_REALTIME_APPS_FILE: appsFile, PROTOBASE_REALTIME_ADDR: `${devHost}:${port}` }, stdio: ['ignore', 'inherit', 'inherit'], detached: true, windowsHide: true })
  const kill = () => child.kill()
  process.once('exit', kill)
  const removeDir = () => rm(dir, { recursive: true, force: true })
  let stopping = false
  child.once('exit', (code) => {
    process.off('exit', kill)
    if (!stopping) void removeDir().then(() => onExit(code))
  })
  // A binary that cannot run, such as one built for another machine, fails here rather than after startup.
  await once(child, 'spawn').catch(async (error: Error) => {
    process.off('exit', kill)
    await removeDir()
    throw error
  })

  const stop = async () => {
    stopping = true
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit')
      child.kill('SIGTERM')
      await exited
    }
    await removeDir()
  }
  return { stop }
}
