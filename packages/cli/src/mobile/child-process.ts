import { spawn as nodeSpawn } from 'node:child_process'

export type ChildOptions = { cwd: string; env: Record<string, string> }

/** Runs a command to its end, in the terminal; rejects when it fails. */
export type RunChild = (command: string, args: string[], options: ChildOptions) => Promise<void>

/**
 * Runs `command` with `args` as given, never through a shell, in `cwd` with exactly `env`: without it the child would
 * get the CLI's whole environment, with the project's secrets.
 */
export const runChild = (command: string, args: string[], { cwd, env }: ChildOptions, spawn = nodeSpawn) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: 'inherit' })
    child.on('error', (error: NodeJS.ErrnoException) => reject(error.code === 'ENOENT' ? new Error(`${command} is not installed, or not on PATH`) : error))
    child.on('close', (status) => (status === 0 ? resolve() : reject(new Error(`\`${command} ${args.join(' ')}\` exited with status ${status}`))))
  })
