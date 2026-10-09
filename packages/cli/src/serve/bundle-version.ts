import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { manifestFile } from '../bundle/manifest'
import { bundleVersionProblem } from '../version/compatibility'
import { protobaseVersion } from '../version/version'

// Refuses a config module whose bundle this runtime cannot serve, by the Protobase version in the manifest beside it.
export const checkBundleVersion = async (configFile: string, runtimeVersion = protobaseVersion) => {
  const file = path.join(path.dirname(configFile), manifestFile)
  if (!existsSync(file)) throw new Error(`${file} is missing; serve the config module of a bundle folder from \`protobase build\``)
  const manifest = JSON.parse(await readFile(file, 'utf8')) as { protobase?: unknown } | null
  const problem = bundleVersionProblem(runtimeVersion, manifest?.protobase)
  if (problem) throw new Error(`${file}: ${problem}`)
}
