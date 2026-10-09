import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { viteBundle } from './vite-bundle'

const here = path.dirname(fileURLToPath(import.meta.url))
const cliRoot = path.resolve(here, '../..')

// The serve runtime (src/serve/main.ts) with every dependency inlined, so a host needs Bun and this one file.
export const buildServeRuntime = async ({ outFile }: { outFile: string }) => {
  await viteBundle({ root: cliRoot, entry: path.join(cliRoot, 'src/serve/main.ts'), outFile, plugins: [] })
}
