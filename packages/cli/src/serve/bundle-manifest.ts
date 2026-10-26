import { existsSync } from 'node:fs'
import path from 'node:path'
import { manifestFile } from '../bundle/manifest'

// Refuses a config module that is not part of a bundle folder, which has the manifest beside it.
export const checkBundleManifest = (configFile: string) => {
  const file = path.join(path.dirname(configFile), manifestFile)
  if (!existsSync(file)) throw new Error(`${file} is missing; serve the config module of a bundle folder from \`protobase build\``)
}
