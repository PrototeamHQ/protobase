import { cpSync, existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Writes a new project to `targetDir` from `templateDir`, which the build writes from the scratch preset, with its
 * package.json named after the folder. The folder may exist only when it is empty.
 */
export const createProject = (templateDir: string, targetDir: string) => {
  if (existsSync(targetDir) && readdirSync(targetDir).length > 0) throw new Error(`${targetDir} is not empty`)
  cpSync(templateDir, targetDir, { recursive: true })
  // The template carries the files packing would leave out, such as .gitignore, with a leading _.
  for (const file of readdirSync(targetDir).filter((file) => file.startsWith('_'))) {
    renameSync(path.join(targetDir, file), path.join(targetDir, file.slice(1)))
  }
  const packageFile = path.join(targetDir, 'package.json')
  const manifest = JSON.parse(readFileSync(packageFile, 'utf8'))
  writeFileSync(packageFile, `${JSON.stringify({ ...manifest, name: path.basename(targetDir) }, null, 2)}\n`)
}
