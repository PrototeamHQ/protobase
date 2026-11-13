// Writes the app bundle the launcher carries to <home>/app when the copy there is not this build's. A new copy is the
// launcher's update: its migrations are applied before it serves.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

/** The bundle's files, each its path in the bundle and where the build embedded it, and an id of their contents. */
export type AppBundle = { id: string; files: [name: string, embedded: string][] }

export const unpackApp = (home: string, bundle: AppBundle) => {
  const dir = path.join(home, 'app')
  const marker = path.join(dir, '.app-id')
  if (existsSync(marker) && readFileSync(marker, 'utf8') === bundle.id) return { dir, updated: false }
  rmSync(dir, { recursive: true, force: true })
  for (const [name, embedded] of bundle.files) {
    const target = path.join(dir, ...name.split('/'))
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, readFileSync(embedded))
  }
  writeFileSync(marker, bundle.id)
  return { dir, updated: true }
}
