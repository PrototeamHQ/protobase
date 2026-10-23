import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { ChildOptions } from './child-process'

/** Runs a command to its end and gives what it printed; rejects when it fails. */
export type CaptureChild = (command: string, args: string[], options: ChildOptions) => Promise<string>

/** Runs `command` with `args` as given, never through a shell, in `cwd` with exactly `env`, and gives its stdout. */
export const captureChild: CaptureChild = async (command, args, { cwd, env }) => (await promisify(execFile)(command, args, { cwd, env, encoding: 'utf8' })).stdout
