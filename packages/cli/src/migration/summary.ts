import path from 'node:path'

/** Where to read how to add sign-in to a project that has none. */
export const signInGuide = 'https://docs.protobase.net/guides/existing-database/'

/**
 * What `protobase migration` prints: the files it wrote, relative to `cwd`, or that the database is current for what
 * the config enables. A config without `auth` enables no sign-in, so its database being current says nothing about it.
 */
export const migrationSummary = (files: string[], cwd: string, hasAuth: boolean) => {
  const written = files.length > 0
    ? files.map((file) => `wrote ${path.relative(cwd, file)}\n`).join('') + "apply them with the project's migrations\n"
    : 'the database is up to date; nothing to write\n'
  if (hasAuth) return written
  return `${written}no sign-in is configured, so nothing was written for it: export auth and authenticate from protobase.config.ts, see ${signInGuide}\n`
}
