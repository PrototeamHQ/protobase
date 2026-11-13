// One launcher per home folder: a second one would share the first one's database and stop it when it exits. The
// launcher holds <home>/launcher.pid while it runs. A file whose process is gone, or whose database is not running, such
// as after a restart of the computer that gave its process id to another program, is from a launcher that was killed.
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const isAlive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // EPERM: the process exists but belongs to someone else.
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false
    if ((error as NodeJS.ErrnoException).code === 'EPERM') return true
    throw error
  }
}

const take = (file: string) => {
  try {
    writeFileSync(file, String(process.pid), { flag: 'wx' })
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false
    throw error
  }
}

/**
 * Takes the home folder for this process, or fails when another launcher runs from it, which `databaseRuns` confirms;
 * returns the release.
 */
export const holdHome = (home: string, databaseRuns: () => boolean) => {
  const file = path.join(home, 'launcher.pid')
  if (!take(file)) {
    const pid = Number(readFileSync(file, 'utf8'))
    if (Number.isInteger(pid) && pid > 0 && isAlive(pid) && databaseRuns()) throw new Error(`Protobase already runs from ${home} (process ${pid}): use its window, or stop it first`)
    rmSync(file, { force: true })
    if (!take(file)) throw new Error(`another launcher took ${home} at the same time`)
  }
  return () => rmSync(file, { force: true })
}
