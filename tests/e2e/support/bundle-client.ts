import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { build } from 'vite'

/** `entry` of this folder bundled for the browser, as one module: @protobase/client as an app's page loads it. */
export const bundleBrowserClient = async (entry = 'browser-client.ts') => {
  const outDir = await mkdtemp(path.join(tmpdir(), 'protobase-browser-client-'))
  await build({
    configFile: false,
    logLevel: 'silent',
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    build: { outDir, minify: false, lib: { entry: path.join(import.meta.dirname, entry), formats: ['es'], fileName: () => 'client.js' } },
  })
  const script = await readFile(path.join(outDir, 'client.js'), 'utf8')
  await rm(outDir, { recursive: true, force: true })
  return script
}
