import { realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { Readable } from 'node:stream'
import { ExitSignal } from './exit-signal'
import { run } from './main'

export type CommandOptions = {
  /** The folder the command runs in; default: the current one. */
  cwd?: string
  /** The command's whole environment, as a child process gets it; default: a copy of the current one. */
  env?: Record<string, string | undefined>
  /** What the command reads from stdin; default: nothing. */
  stdin?: string
}

export type CommandResult = { exitCode: number; stdout: string; stderr: string }

// These run until a signal and end the process themselves, which a host process cannot give them.
const longRunning = new Set(['dev', 'serve', 'worker', 'mobile'])

type Output = { stdout: string; stderr: string }

// Points the process's working folder, environment, stdin, stdout, stderr, exit and exit code at one command's, and
// returns what puts them back.
const enter = (options: CommandOptions, output: Output) => {
  const cwd = process.cwd()
  const env = { ...process.env }
  const exitCode = process.exitCode
  const { exit } = process
  const stdin = Object.getOwnPropertyDescriptor(process, 'stdin')
  const writeOut = process.stdout.write
  const writeErr = process.stderr.write

  const replaceEnv = (next: Record<string, string | undefined>) => {
    for (const name of Object.keys(process.env)) delete process.env[name]
    for (const [name, value] of Object.entries(next)) if (value !== undefined) process.env[name] = value
  }
  const capture = (stream: keyof Output) =>
    ((chunk: string | Uint8Array) => {
      output[stream] += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8')
      return true
    }) as typeof process.stdout.write

  if (options.cwd) process.chdir(options.cwd)
  replaceEnv(options.env ?? env)
  process.exitCode = undefined
  process.exit = ((code?: number | string | null) => {
    throw new ExitSignal(Number(code ?? process.exitCode ?? 0))
  }) as typeof process.exit
  Object.defineProperty(process, 'stdin', { value: Object.assign(Readable.from(options.stdin ? [options.stdin] : []), { isTTY: false }), configurable: true })
  process.stdout.write = capture('stdout')
  process.stderr.write = capture('stderr')

  return () => {
    process.stdout.write = writeOut
    process.stderr.write = writeErr
    if (stdin) Object.defineProperty(process, 'stdin', stdin)
    process.exit = exit
    // Bun keeps the last code when given undefined; 0 ends the process the same way.
    process.exitCode = exitCode ?? 0
    replaceEnv(env)
    process.chdir(cwd)
  }
}

// Bun keeps every module it imported, the project's files too, so the next command would see them as they were. This
// forgets the project's own files the command loaded, outside node_modules, and keeps the packages loaded. On Node the
// project's files go through Vite's module runner, which loads them afresh each time.
const modules = createRequire(import.meta.url).cache

const forgetProjectFiles = (projectDir: string, loadedBefore: Set<string>) => {
  const prefix = realpathSync(projectDir) + path.sep
  for (const file of Object.keys(modules)) {
    if (loadedBefore.has(file) || !file.startsWith(prefix) || file.includes(`${path.sep}node_modules${path.sep}`)) continue
    delete modules[file]
  }
}

const runOne = async (args: string[], options: CommandOptions): Promise<CommandResult> => {
  if (longRunning.has(args[0] ?? '')) throw new Error(`protobase ${args[0]} runs until a signal; start it as a process`)
  const output = { stdout: '', stderr: '' }
  const loadedBefore = new Set(Object.keys(modules))
  const leave = enter(options, output)
  try {
    await run(['protobase', 'protobase', ...args])
    return { exitCode: Number(process.exitCode ?? 0), ...output }
  } finally {
    forgetProjectFiles(process.cwd(), loadedBefore)
    leave()
  }
}

// The process has one working folder, environment and stdout, so commands run one at a time.
let queue: Promise<unknown> = Promise.resolve()

/**
 * Runs one protobase command in this process, as `protobase <args>` would run in a process of its own, and returns its
 * exit code and output. The CLI stays loaded between commands, so only the first pays for starting it.
 */
export const runCommand = (args: string[], options: CommandOptions = {}): Promise<CommandResult> => {
  const result = queue.then(() => runOne(args, options))
  // The next command waits for this one to end, however it ends; its caller gets the outcome.
  queue = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}
