import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { build } from 'vite'

/** `browser-client.ts` bundled for the browser, as one module: @protobase/client as an app's page loads it. */
export const bundleBrowserClient = async () => {
  const outDir = await mkdtemp(path.join(tmpdir(), 'protobase-browser-client-'))
  await build({
    configFile: false,
    logLevel: 'silent',
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    build: { outDir, minify: false, lib: { entry: path.join(import.meta.dirname, 'browser-client.ts'), formats: ['es'], fileName: () => 'client.js' } },
  })
  const script = await readFile(path.join(outDir, 'client.js'), 'utf8')
  await rm(outDir, { recursive: true, force: true })
  return script
}
