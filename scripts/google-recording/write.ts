import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Recordings } from './google-calls'
import { findLeak } from './scrub'

const root = join(import.meta.dirname, '..', '..')

/** Where the Gmail fake's recordings and the server's Google snapshots live. */
export const recordingDirs = {
  gmail: join(root, 'test-support', 'fake-gmail', 'recordings'),
  google: join(root, 'packages', 'server', 'src', 'better-auth', 'connections', 'testing', 'snapshots', 'google'),
}

const text = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`

/**
 * Writes the recordings, once none of them leaks a secret value, a token shape or an address off example.com, and reads
 * every file back to check it again. An error names the file and the kind of leak, never the value. Gives the files.
 */
export const writeRecordings = ({ gmail, google, secrets }: Recordings, dirs = recordingDirs) => {
  const files = [
    ...Object.entries(gmail).map(([name, recording]) => ({ path: join(dirs.gmail, `${name}.json`), content: text(recording) })),
    ...Object.entries(google).map(([name, recording]) => ({ path: join(dirs.google, `${name}.json`), content: text(recording) })),
  ]
  for (const { path, content } of files) {
    const leak = findLeak(JSON.parse(content), secrets) ?? findLeak(content, secrets)
    if (leak) throw new Error(`Not written: ${path} would keep ${leak}`)
  }
  for (const dir of Object.values(dirs)) mkdirSync(dir, { recursive: true })
  for (const { path, content } of files) writeFileSync(path, content)
  for (const { path } of files) {
    const written = readFileSync(path, 'utf8')
    const leak = findLeak(JSON.parse(written), secrets) ?? findLeak(written, secrets)
    if (leak) throw new Error(`${path} keeps ${leak}: restore it with git before committing`)
  }
  return files.map(({ path }) => path)
}
