import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { moduleFile } from '../module-file'
import type { Extension } from '../project/extensions'

const conventionModule = moduleFile('../project/convention', import.meta.url)

const uiDirs = (configDir: string) =>
  readdirSync(configDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(path.join(configDir, entry.name, 'ui.ts')))
    .map((entry) => entry.name)
    .sort()

// The bundle's entry module: protobase.config.ts's default export, with `config` from the convention
// (config/index.ts and config/*/ui.ts) when it has none, merged after the extensions' configs and with the configs it
// extends, as `protobase dev` loads a project.
export const bundleEntryCode = (projectDir: string, extensions: Extension[] = []) => {
  const custom = path.join(projectDir, 'protobase.config.ts')
  const configDir = path.join(projectDir, 'config')
  const index = path.join(configDir, 'index.ts')
  const hasCustom = existsSync(custom)
  const hasIndex = existsSync(index)
  if (!hasCustom && !hasIndex) throw new Error(`No protobase.config.ts or config/index.ts in ${projectDir}`)

  const lines = hasCustom ? [`import * as custom from ${JSON.stringify(custom)}`, 'const project = custom.default ?? {}'] : ['const project = {}']
  if (hasIndex) {
    const dirs = uiDirs(configDir)
    lines.push(
      `import { conventionConfig } from ${JSON.stringify(conventionModule)}`,
      `import * as index from ${JSON.stringify(index)}`,
      ...dirs.map((dir, i) => `import * as ui${i} from ${JSON.stringify(path.join(configDir, dir, 'ui.ts'))}`),
      `const convention = conventionConfig(index, [${dirs.map((dir, i) => `[${JSON.stringify(dir)}, ui${i}]`).join(', ')}])`,
    )
  } else {
    lines.push('const convention = undefined')
  }
  const configs = extensions.flatMap((extension) => (extension.config ? [extension.config] : []))
  lines.push(
    `import { mergeConfig } from '@protobase/server'`,
    ...configs.map((file, i) => `import * as extension${i} from ${JSON.stringify(file)}`),
    // Each config is named in merge errors by its own name, otherwise by its file.
    'const named = (config, file) => ({ ...config, name: config.name ?? file })',
    `export default mergeConfig(${[
      ...configs.map((file, i) => `named(extension${i}.default ?? {}, ${JSON.stringify(file)})`),
      `named({ ...project, config: project.config ?? convention }, ${JSON.stringify(hasCustom ? 'protobase.config.ts' : 'config/index.ts')})`,
    ].join(', ')})`,
  )
  return `${lines.join('\n')}\n`
}
