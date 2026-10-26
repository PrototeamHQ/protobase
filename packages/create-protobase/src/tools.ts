import { spawnSync } from 'node:child_process'
import type { Tools } from './next-steps'

// Whether `command` runs: spawning one that is not on PATH fails with ENOENT.
const runs = (command: string) => spawnSync(command, ['--version'], { stdio: 'ignore' }).error === undefined

/** Which of the commands the next steps use are on PATH. */
export const findTools = (): Tools => ({ bun: runs('bun'), docker: runs('docker') })
