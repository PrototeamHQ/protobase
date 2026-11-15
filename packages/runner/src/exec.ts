import { spawn } from 'node:child_process'

/** How a command ran: its exit code, 128 and up for a signal, and the ends of its output. */
export type ExecResult = { code: number; stdout: string; stderr: string }

export type ExecOptions = {
  /** Variables added to the runner's own environment for the command, so their values stay off its command line. */
  env?: Record<string, string>
  /** Kills the command once aborted. */
  signal?: AbortSignal
  /** Each line of its output as it comes. */
  line?: (line: string, stream: 'stdout' | 'stderr') => void
}

/** Runs a program with its arguments, never through a shell. */
export type Exec = (command: string, args: readonly string[], options?: ExecOptions) => Promise<ExecResult>

// The most of a command's output kept whole; its lines all go to `line`.
const keptChars = 64 * 1024

/** The longest line a command's output gives: past it, what came so far is a line of its own, so no output without a newline grows the runner's memory. */
export const maxLineChars = 64 * 1024

/** The machine's `Exec`: a child process, its output split into lines of at most `maxLineChars`, the last 64 KiB of each stream kept. */
export const exec: Exec = (command, args, { env, signal, line } = {}) =>
  new Promise((resolve) => {
    const child = spawn(command, args, { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
    const kept = { stdout: '', stderr: '' }
    const partial = { stdout: '', stderr: '' }
    const read = (stream: 'stdout' | 'stderr') => (chunk: Buffer) => {
      const text = chunk.toString('utf8')
      kept[stream] = (kept[stream] + text).slice(-keptChars)
      const lines = (partial[stream] + text).split('\n')
      partial[stream] = lines.pop()!
      for (const one of lines) for (let at = 0; at < Math.max(one.length, 1); at += maxLineChars) line?.(one.slice(at, at + maxLineChars).replace(/\r$/, ''), stream)
      while (partial[stream].length >= maxLineChars) {
        line?.(partial[stream].slice(0, maxLineChars), stream)
        partial[stream] = partial[stream].slice(maxLineChars)
      }
    }
    child.stdout.on('data', read('stdout'))
    child.stderr.on('data', read('stderr'))
    const kill = () => child.kill('SIGKILL')
    signal?.addEventListener('abort', kill, { once: true })
    if (signal?.aborted) kill()
    let done = false
    const finish = (code: number) => {
      if (done) return
      done = true
      signal?.removeEventListener('abort', kill)
      for (const stream of ['stdout', 'stderr'] as const) if (partial[stream] !== '') line?.(partial[stream], stream)
      resolve({ code, ...kept })
    }
    child.on('error', (error) => {
      kept.stderr += `${error.message}\n`
      finish(127)
    })
    child.on('close', (code, killedBy) => finish(code ?? (killedBy ? 137 : 1)))
  })
