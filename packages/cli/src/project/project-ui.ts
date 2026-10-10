import { existsSync } from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'
import type { Extension } from './extensions'

// The admin app imports the project's React code for composed pages and widgets (custom components, action handlers)
// from this id: `protobase.ui.tsx` in the project when there is one, otherwise an empty module; with extensions that
// have UI configs, a module merging theirs first and the project's last.
export const projectUiId = 'virtual:protobase-project-ui'

const empty = `\0${projectUiId}`

export const projectUiFile = (projectDir: string) => path.join(projectDir, 'protobase.ui.tsx')

// The merging module stands in for a file in the project, so its import of @protobase/ui resolves from there; a build
// can start from that file too.
export const mergedUiFile = (projectDir: string) => path.join(projectDir, 'protobase-ui-entry.js')

// Each UI config is named in merge errors by its own name, otherwise by its file.
export const mergedUiCode = (projectDir: string, extensions: Extension[]) => {
  const files = extensions.flatMap((extension) => (extension.ui ? [extension.ui] : []))
  const own = projectUiFile(projectDir)
  const hasOwn = existsSync(own)
  return [
    `import { mergeUi } from '@protobase/ui'`,
    ...files.map((file, i) => `import * as extension${i} from ${JSON.stringify(file)}`),
    ...(hasOwn ? [`import * as project from ${JSON.stringify(own)}`] : []),
    'const named = (ui, file) => ({ ...ui, name: ui.name ?? file })',
    `export default mergeUi(${[
      ...files.map((file, i) => `named(extension${i}.default ?? {}, ${JSON.stringify(file)})`),
      ...(hasOwn ? [`named(project.default ?? {}, "protobase.ui.tsx")`] : []),
    ].join(', ')})`,
    '',
  ].join('\n')
}

export const projectUiPlugin = (projectDir: string | undefined, extensions: Extension[] = []): Plugin => {
  const merged = projectDir !== undefined && extensions.some((extension) => extension.ui) ? `\0${mergedUiFile(projectDir)}` : undefined
  return {
    name: 'protobase-project-ui',
    resolveId: (id) => {
      if (merged && (id === projectUiId || id === mergedUiFile(projectDir!))) return merged
      if (id !== projectUiId) return undefined
      const file = projectDir === undefined ? undefined : projectUiFile(projectDir)
      return file && existsSync(file) ? file : empty
    },
    load: (id) => {
      if (id === empty) return 'export default {}\n'
      if (id === merged) return mergedUiCode(projectDir!, extensions)
      return undefined
    },
  }
}
