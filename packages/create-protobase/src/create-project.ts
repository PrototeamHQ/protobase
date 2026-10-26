import { cpSync, existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { databaseUrl, envFile, withDatabasePort } from './env-file'
import { composeFile, databaseScripts } from './local-database'

/** What a new project gets beyond its preset's files: its Postgres's port and the secret its .env signs cookies with. */
export type ProjectSettings = { port: number; secret: string }

/**
 * Writes a new project to `targetDir` from `templateDir`, which the build writes from a preset, and returns its
 * package.json: named after the folder, with db:up and db:down for the docker-compose.yml it adds, whose Postgres takes
 * `port` in it, .env.example and a .env with `secret`. The folder may exist only when it is empty.
 */
export const createProject = (templateDir: string, targetDir: string, { port, secret }: ProjectSettings) => {
  if (existsSync(targetDir) && readdirSync(targetDir).length > 0) throw new Error(`${targetDir} is not empty`)
  cpSync(templateDir, targetDir, { recursive: true })
  // The template carries the files packing would leave out, such as .gitignore, with a leading _.
  for (const file of readdirSync(targetDir).filter((file) => file.startsWith('_'))) {
    renameSync(path.join(targetDir, file), path.join(targetDir, file.slice(1)))
  }

  const packageFile = path.join(targetDir, 'package.json')
  const source = JSON.parse(readFileSync(packageFile, 'utf8'))
  const manifest = { ...source, name: path.basename(targetDir), scripts: { ...databaseScripts, ...source.scripts } }
  writeFileSync(packageFile, `${JSON.stringify(manifest, null, 2)}\n`)

  const example = withDatabasePort(readFileSync(path.join(targetDir, '.env.example'), 'utf8'), port)
  writeFileSync(path.join(targetDir, '.env.example'), example)
  writeFileSync(path.join(targetDir, '.env'), envFile(example, secret))
  writeFileSync(path.join(targetDir, 'docker-compose.yml'), composeFile(databaseUrl(example)))
  return manifest
}
