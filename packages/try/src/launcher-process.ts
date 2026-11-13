// Whether a process id belongs to a running protobase-try.exe, as Windows' tasklist names it, so a launcher's lock is
// told apart from a process id that a restart gave to another program.
import { spawnSync } from 'node:child_process'
import path from 'node:path'

/** Whether tasklist's CSV line for one process names the image `image`. */
export const listsImage = (tasklistCsv: string, image: string) => tasklistCsv.toLowerCase().startsWith(`"${image.toLowerCase()}",`)

export const isLauncherProcess = (pid: number) => {
  const result = spawnSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`tasklist failed: ${result.stderr}`)
  return listsImage(result.stdout.trim(), path.basename(process.execPath))
}
