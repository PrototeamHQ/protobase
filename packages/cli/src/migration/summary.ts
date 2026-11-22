import path from 'node:path'
import { snapshotFile } from './snapshot/snapshot-file'

/** Where to read how to add sign-in to a project that has none. */
export const signInGuide = 'https://docs.protobase.net/guides/existing-database/'

/**
 * What `protobase migration` prints: the file it wrote, relative to `cwd`, or that the migrations already make what
 * the config needs. Without a database (`compared` false), the features besides the auth store were not compared. A
 * config with sign-in off (`auth: false`) has no auth store, so the migrations being current says nothing about it.
 */
export const migrationSummary = (file: string | undefined, cwd: string, { hasAuth, compared }: { hasAuth: boolean; compared: boolean }) => {
  const written = file
    ? `wrote ${path.relative(cwd, file)} and ${snapshotFile}\napply it with the project's migrations\n`
    : 'the migrations make what the config needs; nothing to write\n'
  const database = compared ? '' : 'DATABASE_URL is not set, so only the auth store was compared: set it to compare the other features with the database\n'
  const signIn = hasAuth ? '' : `sign-in is off, so nothing was written for it: see ${signInGuide}\n`
  return `${written}${database}${signIn}`
}
