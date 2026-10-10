import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { extensionImports, type Extension } from '../project/extensions'
import { mergedUiFile, projectUiPlugin } from '../project/project-ui'
import { viteBundle } from './vite-bundle'

// Loads the merged UI configs once in Node, everything bundled into a scratch file, so two configs defining the same
// component or action handler fail the build, naming both, instead of the app in the browser. It loads only browser
// code, which needs no secrets; nothing is rendered.
export const checkUiMerge = async (projectDir: string, extensions: Extension[]) => {
  const scratch = await mkdtemp(path.join(tmpdir(), 'protobase-ui-check-'))
  const outFile = path.join(scratch, 'ui-check.js')
  try {
    // Bundling React libraries for Node warns about their "use client" directives, which do not matter here.
    const plugins = [projectUiPlugin(projectDir, extensions), extensionImports(projectDir, extensions)]
    await viteBundle({ root: projectDir, entry: mergedUiFile(projectDir), outFile, plugins, logLevel: 'error' })
    await import(pathToFileURL(outFile).href)
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
}
