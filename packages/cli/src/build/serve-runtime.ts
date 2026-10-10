import { fileURLToPath } from 'node:url'
import { moduleFile } from '../module-file'
import { viteBundle } from './vite-bundle'

const cliRoot = fileURLToPath(new URL('../..', import.meta.url))
const serveMain = moduleFile('../serve/main', import.meta.url)

// The serve runtime (serve/main.ts) with every dependency inlined, so a host needs Bun and this one file.
export const buildServeRuntime = async ({ outFile, bun }: { outFile: string; bun?: boolean }) => {
  await viteBundle({ root: cliRoot, entry: serveMain, outFile, bun, plugins: [] })
}
