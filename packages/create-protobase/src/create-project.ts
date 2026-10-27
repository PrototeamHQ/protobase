import { cpSync, existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { databaseUrl, envFile, withDatabasePort, withDatabaseUrl, withoutPassword } from './env-file'
import { composeFile, databaseScripts } from './local-database'

/**
 * What a new project gets beyond its preset's files: the secret its .env signs cookies with, and its database: a
 * Postgres of its own in Docker on `port`, or the existing one at `url`.
 */
export type ProjectSettings = { secret: string; database: { port: number } | { url: string } }

/**
 * Writes a new project to `targetDir` from `templateDir`, which the build writes from a preset, and returns its
 * package.json, named after the folder. On a Postgres of its own it gets db:up and db:down for the docker-compose.yml it
 * adds, whose Postgres takes `port` in .env.example and in a .env with `secret`; on an existing database its .env has
 * that database's URL and `secret`, and .env.example the URL without its password. The folder may exist only when it is
 * empty.
 */
export const createProject = (templateDir: string, targetDir: string, { secret, database }: ProjectSettings) => {
  if (existsSync(targetDir) && readdirSync(targetDir).length > 0) throw new Error(`${targetDir} is not empty`)
  cpSync(templateDir, targetDir, { recursive: true })
  // The template carries the files packing would leave out, such as .gitignore, with a leading _.
  for (const file of readdirSync(targetDir).filter((file) => file.startsWith('_'))) {
    renameSync(path.join(targetDir, file), path.join(targetDir, file.slice(1)))
  }

  const packageFile = path.join(targetDir, 'package.json')
  const source = JSON.parse(readFileSync(packageFile, 'utf8'))
  const scripts = 'url' in database ? source.scripts : { ...databaseScripts, ...source.scripts }
  const manifest = { ...source, name: path.basename(targetDir), scripts }
  writeFileSync(packageFile, `${JSON.stringify(manifest, null, 2)}\n`)

  const presetExample = readFileSync(path.join(targetDir, '.env.example'), 'utf8')
  if ('url' in database) {
    writeFileSync(path.join(targetDir, '.env.example'), withDatabaseUrl(presetExample, withoutPassword(database.url)))
    writeFileSync(path.join(targetDir, '.env'), envFile(withDatabaseUrl(presetExample, database.url), secret))
    return manifest
  }
  const example = withDatabasePort(presetExample, database.port)
  writeFileSync(path.join(targetDir, '.env.example'), example)
  writeFileSync(path.join(targetDir, '.env'), envFile(example, secret))
  writeFileSync(path.join(targetDir, 'docker-compose.yml'), composeFile(databaseUrl(example)))
  return manifest
}
