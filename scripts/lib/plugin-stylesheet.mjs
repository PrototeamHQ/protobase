import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * The stylesheet of the layout snapshots' plugin (scripts/dom-snapshots/plugin), built by the plugin build of the
 * checkout in `root`, as `protobase build` builds a project's UI. Its @protobase/ui resolves from the ERP example.
 */
export const pluginStylesheet = async (root) => {
  const { buildPlugin } = await import(join(root, 'packages/cli/src/build/plugin-build.ts'))
  const outDir = await mkdtemp(join(tmpdir(), 'protobase-layout-plugin-'))
  try {
    const manifest = await buildPlugin({ pluginDir: join(root, 'scripts/dom-snapshots/plugin'), outDir, name: 'layout-probe', projectDir: join(root, 'examples/erp') })
    return await readFile(join(outDir, manifest.css), 'utf8')
  } finally {
    await rm(outDir, { recursive: true, force: true })
  }
}
