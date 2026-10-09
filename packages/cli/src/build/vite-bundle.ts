import path from 'node:path'
import { build, type Plugin } from 'vite'

export type BundleInput = {
  // Folder the entry's imports resolve from.
  root: string
  // A module id the plugins resolve, or a file.
  entry: string
  outFile: string
  plugins: Plugin[]
}

// One ESM file for Bun, everything inlined except what the plugins mark external and Node's builtins. The `// @bun`
// pragma tells Bun the file needs no transpiling, so Bun neither transpiles it nor writes its transpiler cache.
export const viteBundle = async ({ root, entry, outFile, plugins }: BundleInput) => {
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
        output: { entryFileNames: path.basename(outFile), format: 'es', codeSplitting: false, banner: '// @bun' },
      },
    },
  })
}
