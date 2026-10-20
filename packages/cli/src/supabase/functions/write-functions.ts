import { existsSync } from 'node:fs'
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { FunctionsPlan } from './plan-functions'
import { isJsrPackage, type ImportedPackage } from './specifier'

const jsrRegistry = '@jsr:registry=https://npm.jsr.io'

/** Adds to package.json's dependencies each package it lacks, making the file when there is none; returns those added. */
const addDependencies = async (projectDir: string, packages: ImportedPackage[]) => {
  const file = path.join(projectDir, 'package.json')
  const manifest = existsSync(file) ? JSON.parse(await readFile(file, 'utf8')) : { private: true }
  const listed = { ...manifest.dependencies, ...manifest.devDependencies }
  const added = packages.filter((pkg) => listed[pkg.name] === undefined)
  if (added.length === 0) return added
  manifest.dependencies = { ...manifest.dependencies, ...Object.fromEntries(added.map((pkg) => [pkg.name, pkg.range])) }
  await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`)
  return added
}

/** Names jsr's npm registry in .npmrc, as `npx jsr add` does, unless a line says it already. */
const addJsrRegistry = async (projectDir: string) => {
  const file = path.join(projectDir, '.npmrc')
  const text = existsSync(file) ? await readFile(file, 'utf8') : ''
  if (text.split('\n').some((line) => line.trim() === jsrRegistry)) return
  await appendFile(file, `${text === '' || text.endsWith('\n') ? '' : '\n'}${jsrRegistry}\n`)
}

/** Writes the converted functions into the project and their packages into package.json; returns the packages added. */
export const writeFunctions = async (projectDir: string, plan: FunctionsPlan) => {
  for (const file of plan.files) {
    const target = path.join(projectDir, file.path)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, file.content, { flag: 'wx' })
  }
  const added = await addDependencies(projectDir, plan.packages)
  if (added.some(isJsrPackage)) await addJsrRegistry(projectDir)
  return added
}
