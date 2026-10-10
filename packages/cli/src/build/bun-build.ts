import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)

// Bun's bundler writes the final file from the one Vite wrote, for a bundle only Bun runs. Its `--target bun` output
// starts with the `// @bun` pragma, so Bun neither transpiles the file nor writes its transpiler cache, and it is
// written the way that pragma promises: Bun reads such a file as Latin-1, so its bundler escapes non-ASCII text.
// Every import left in the Vite output is one the runtime supplies, so packages stay external.
export const bunBuild = async (input: string, outFile: string) => {
  try {
    await run('bun', ['build', input, '--target', 'bun', '--format', 'esm', '--packages', 'external', '--outfile', outFile])
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error('--bun needs Bun to write the bundle: install it from https://bun.sh and put `bun` on PATH, or build without --bun')
    }
    throw error
  }
}
