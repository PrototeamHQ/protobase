// Writes the app bundle the launcher carries to <home>/app when the copy there is not this build's. A new copy is the
// launcher's update: its migrations are applied before it serves, and only then is the copy marked as this build's, so
// a failed migration is tried again on the next run.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

/** The bundle's files, each its path in the bundle and where the build embedded it, and an id of their contents. */
export type AppBundle = { id: string; files: [name: string, embedded: string][] }

const markerOf = (dir: string) => path.join(dir, '.app-id')

export const unpackApp = (home: string, bundle: AppBundle) => {
  const dir = path.join(home, 'app')
  if (existsSync(markerOf(dir)) && readFileSync(markerOf(dir), 'utf8') === bundle.id) return { dir, updated: false }
  rmSync(dir, { recursive: true, force: true })
  for (const [name, embedded] of bundle.files) {
    const target = path.join(dir, ...name.split('/'))
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, readFileSync(embedded))
  }
  return { dir, updated: true }
}

/** Marks the copy in `dir` as this build's, once its migrations are applied. */
export const markApp = (dir: string, bundle: AppBundle) => writeFileSync(markerOf(dir), bundle.id)
