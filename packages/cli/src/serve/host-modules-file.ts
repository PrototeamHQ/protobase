import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { hostModuleIds } from './host-module-ids'

// The file the CLI's build writes beside its code, published as `@protobase/cli/host-modules.json`: the modules this
// version's serve runtime supplies to a config bundle, as a JSON array, so a program reads them for a given version
// without running it.
export const hostModulesFileName = 'host-modules.json'

export const writeHostModulesFile = (dir: string, ids: readonly string[] = hostModuleIds) =>
  writeFile(path.join(dir, hostModulesFileName), `${JSON.stringify(ids, null, 2)}\n`)
