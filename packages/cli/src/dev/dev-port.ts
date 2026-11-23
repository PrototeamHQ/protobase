import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { protobaseFolder } from '../project/protobase-folder'
import { heldOn } from './loopback'

/** Where `protobase dev` keeps the project's port: `.protobase/` is this machine's and ignores itself in git. */
export const devPortFile = path.join(protobaseFolder, 'dev-port')

// Clear of the common development ports below it and of the ephemeral ports operating systems hand out above it.
export const randomPorts = { min: 10000, max: 49151 }
const tries = 20

/** The port saved for the project, undefined when no file holds one, such as a missing or garbled file. */
export const readSavedPort = async (projectDir: string) => {
  let text: string
  try {
    text = await readFile(path.join(projectDir, devPortFile), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }
  const trimmed = text.trim()
  if (!/^\d{1,5}$/.test(trimmed)) return
  const port = Number(trimmed)
  return port >= 1 && port <= 65535 ? port : undefined
}

// A running dev server rebuilds its API on any write inside the project, so an unchanged port is left alone.
export const savePort = async (projectDir: string, port: number) => {
  if ((await readSavedPort(projectDir)) === port) return
  await mkdir(path.join(projectDir, protobaseFolder), { recursive: true })
  await writeFile(path.join(projectDir, devPortFile), `${port}\n`)
}

/** A random port in `randomPorts` that no process holds on either loopback address, trying a fixed number of them. */
export const pickFreePort = async (held = heldOn, random = Math.random) => {
  for (let tried = 0; tried < tries; tried++) {
    const port = randomPorts.min + Math.floor(random() * (randomPorts.max - randomPorts.min + 1))
    if (!(await held(port))) return port
  }
  throw new Error(`Found no free port among ${tries} random ones from ${randomPorts.min} to ${randomPorts.max}; pass one with --port <port>`)
}

/** The address `protobase dev` serves on `port`, the app's `url` when it sets none. */
export const devAddress = (port: number) => `http://localhost:${port}`

/**
 * The port `protobase dev` serves the project on: `chosen`, saved as the project's port for later runs, else the saved
 * one, else a free random one, saved.
 */
export const devPort = async (projectDir: string, chosen: number | undefined, pick = pickFreePort) => {
  if (chosen !== undefined) {
    await savePort(projectDir, chosen)
    return chosen
  }
  const saved = await readSavedPort(projectDir)
  if (saved !== undefined) return saved
  const picked = await pick()
  await savePort(projectDir, picked)
  return picked
}
