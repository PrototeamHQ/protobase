import { fork } from 'node:child_process'
import path from 'node:path'
import { moduleFile } from '../module-file'
import type { ApiProcessMessage, ApiProcessOptions, ApiProcessStart } from './api-process'

export type ApiChild = {
  port: number
  /** Whether the auth store has a user yet, for the banner's sign-in line; undefined without one. */
  anyUsers: boolean | undefined
  /** How the auth store's tables differ from what the project's Better Auth needs; none when they match. */
  authDrift: string[]
}

const apiProcess = moduleFile('./api-process', import.meta.url)

// From source on Node, the API process loads its TypeScript through tsx, as bin/protobase-source.mjs does.
const loaderArgs = () => (path.extname(apiProcess) === '.ts' && !process.versions.bun ? ['--import', import.meta.resolve('tsx')] : [])

/**
 * Forks the API of `protobase dev` into a process of its own, on the same runtime and with the same environment, which
 * loads @protobase/server meanwhile. `start` has it load the API for the dev server at `devUrl` and resolves once it
 * listens, or rejects with the error that stopped it loading; `stop` lets its running jobs finish and ends it. `onExit`
 * hears of an API process that ends while it serves, other than through `stop`.
 */
export const forkApiChild = (options: ApiProcessOptions, onExit: (code: number) => void) => {
  const child = fork(apiProcess, [JSON.stringify(options)], { execArgv: [...process.execArgv, ...loaderArgs()] })
  let stopping = false
  let ready = false
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
  // Its first message, or how it ended before one; this never rejects, so nothing waits on a failure unheard.
  const outcome = new Promise<ApiProcessMessage>((resolve) => {
    child.once('message', resolve)
    child.once('exit', (code, signal) => resolve({ failed: `The API process of protobase dev ended (${signal ?? `exit code ${code}`}) before it was ready` }))
  })
  child.once('exit', (code) => {
    if (ready && !stopping) onExit(code ?? 1)
  })

  const stop = async () => {
    stopping = true
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
    await exited
  }

  const start = async (devUrl: string): Promise<ApiChild> => {
    if (child.connected) child.send({ start: { devUrl } } satisfies ApiProcessStart)
    const message = await outcome
    if ('failed' in message) {
      await stop()
      throw new Error(message.failed)
    }
    ready = true
    return { port: message.ready.port, anyUsers: message.ready.anyUsers, authDrift: message.ready.authDrift }
  }

  return { start, stop }
}
