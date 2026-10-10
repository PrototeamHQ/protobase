import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { build, type Plugin } from 'vite'
import { bunBuild } from './bun-build'

export type BundleInput = {
  // Folder the entry's imports resolve from.
  root: string
  // A module id the plugins resolve, or a file.
  entry: string
  outFile: string
  plugins: Plugin[]
}

const viteBuild = async ({ root, entry, outFile, plugins }: BundleInput) => {
  await build({
    configFile: false,
    root,
    publicDir: false,
    logLevel: 'warn',
    plugins,
    // Production JSX whatever NODE_ENV says (vitest sets `test`): layout files import @protobase/layout/jsx-runtime, which the
    // serve runtime supplies, never the development runtime.
    oxc: { jsx: { development: false } },
    ssr: { noExternal: true, target: 'node' },
    build: {
      ssr: entry,
      outDir: path.dirname(outFile),
      emptyOutDir: false,
      copyPublicDir: false,
      minify: false,
      target: 'esnext',
      rolldownOptions: {
        // pg's optional native binding, only loaded when `pg.native` is read.
        external: ['pg-native'],
        output: { entryFileNames: path.basename(outFile), format: 'es', codeSplitting: false },
      },
    },
  })
}

// One ESM file for Bun, everything inlined except what the plugins mark external and Node's builtins. Vite writes it to a
// scratch folder and Bun's bundler writes the final file (see bunBuild).
export const viteBundle = async ({ root, entry, outFile, plugins }: BundleInput) => {
  const scratch = await mkdtemp(path.join(tmpdir(), 'protobase-bundle-'))
  try {
    await viteBuild({ root, entry, outFile: path.join(scratch, 'bundle.js'), plugins })
    await bunBuild(path.join(scratch, 'bundle.js'), outFile)
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
}
