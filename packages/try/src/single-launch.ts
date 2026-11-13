// One launcher per home folder: a second one would share the first one's download, database and app, and stop them when
// it exits. The launcher holds <home>/launcher.pid from before it reads its settings until it has stopped everything. A
// file whose process is no launcher, such as one killed, or after a restart that gave its id to another program, is
// taken over.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const take = (file: string) => {
  try {
    writeFileSync(file, String(process.pid), { flag: 'wx' })
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false
    throw error
  }
}

/** Takes the home folder for this process, or fails when the launcher `isLauncher` confirms holds it; returns the release. */
export const holdHome = (home: string, isLauncher: (pid: number) => boolean) => {
  mkdirSync(home, { recursive: true })
  const file = path.join(home, 'launcher.pid')
  if (!take(file)) {
    const pid = Number(readFileSync(file, 'utf8'))
    if (Number.isInteger(pid) && pid > 0 && pid !== process.pid && isLauncher(pid)) throw new Error(`Protobase already runs from ${home} (process ${pid}): use its window, or stop it first`)
    rmSync(file, { force: true })
    if (!take(file)) throw new Error(`another launcher took ${home} at the same time`)
  }
  return () => rmSync(file, { force: true })
}
