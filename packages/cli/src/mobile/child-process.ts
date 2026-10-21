import { spawn as nodeSpawn } from 'node:child_process'

export type ChildOptions = { cwd: string; env: Record<string, string> }

/** Runs a command to its end, in the terminal; rejects when it fails. */
export type RunChild = (command: string, args: string[], options: ChildOptions) => Promise<void>

// The signals that would end the CLI. Its child gets them instead, and the CLI ends once the child has, so no child
// outlives it: Gradle holds the upload key in its environment.
const forwarded: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGHUP']

/**
 * Runs `command` with `args` as given, never through a shell, in `cwd` with exactly `env`: without it the child would
 * get the CLI's whole environment, with the project's secrets.
 */
export const runChild = (command: string, args: string[], { cwd, env }: ChildOptions, spawn = nodeSpawn) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: 'inherit' })
    const forward = (signal: NodeJS.Signals) => void child.kill(signal)
    for (const signal of forwarded) process.on(signal, forward)
    const done = () => {
      for (const signal of forwarded) process.off(signal, forward)
    }
    child.on('error', (error: NodeJS.ErrnoException) => {
      done()
      reject(error.code === 'ENOENT' ? new Error(`${command} is not installed, or not on PATH`) : error)
    })
    child.on('close', (status, signal) => {
      done()
      if (status === 0) resolve()
      else reject(new Error(`\`${command} ${args.join(' ')}\` ${signal ? `ended on ${signal}` : `exited with status ${status}`}`))
    })
  })
