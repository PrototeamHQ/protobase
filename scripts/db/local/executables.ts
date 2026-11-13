import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

/** The path of the executable `name`: in the folder `bin` when given, else the first on PATH; undefined when there is none. */
export const findExecutable = (name: string, bin: string | undefined) => {
  const folders = bin ? [bin] : (process.env.PATH ?? '').split(path.delimiter).filter(Boolean)
  return folders.map((folder) => path.join(folder, name)).find((file) => existsSync(file))
}

/** Runs an executable to its end with the output on the terminal, and fails when it does. */
export const run = (command: string, args: string[]) => {
  const { status, error } = spawnSync(command, args, { stdio: 'inherit' })
  if (error) throw error
  if (status !== 0) throw new Error(`${path.basename(command)} exited with ${status}`)
}

/** Runs an executable quietly and returns its exit code and output. */
export const capture = (command: string, args: string[]) => {
  const { status, stdout, error } = spawnSync(command, args, { encoding: 'utf8' })
  if (error) throw error
  return { status, stdout }
}
