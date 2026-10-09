import { existsSync } from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'

// The admin app imports the project's React code for composed pages (custom components, action handlers) from this
// id: `protobase.ui.tsx` in the project when there is one, otherwise an empty module.
export const projectUiId = 'virtual:protobase-project-ui'

const empty = `\0${projectUiId}`

export const projectUiFile = (projectDir: string) => path.join(projectDir, 'protobase.ui.tsx')

export const projectUiPlugin = (projectDir: string | undefined): Plugin => ({
  name: 'protobase-project-ui',
  resolveId: (id) => {
    if (id !== projectUiId) return undefined
    const file = projectDir === undefined ? undefined : projectUiFile(projectDir)
    return file && existsSync(file) ? file : empty
  },
  load: (id) => (id === empty ? 'export default {}\n' : undefined),
})
