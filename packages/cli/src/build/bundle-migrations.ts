import { existsSync } from 'node:fs'
import { copyFile, mkdir, readdir } from 'node:fs/promises'
import path from 'node:path'
import { bundleMigrations } from '../bundle/manifest'

// The folder `protobase migration` and `protobase auth migration` write to by default.
export const projectMigrations = 'db/migrations'

// Copies the project's db/migrations/*.sql, and nothing else of that folder, into the bundle for the serve runtime's
// `migrate`; returns the manifest's `migrations`, or undefined for a project without that folder.
export const copyMigrations = async ({ projectDir, outDir }: { projectDir: string; outDir: string }) => {
  const source = path.join(projectDir, projectMigrations)
  if (!existsSync(source)) return undefined
  const target = path.join(outDir, bundleMigrations)
  await mkdir(target, { recursive: true })
  const files = (await readdir(source, { withFileTypes: true })).filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
  for (const file of files) await copyFile(path.join(source, file.name), path.join(target, file.name))
  return bundleMigrations
}
