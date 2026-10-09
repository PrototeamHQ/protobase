import path from 'node:path'
import { fileURLToPath } from 'node:url'

// A module the CLI loads by path rather than by import, relative to `from` (an import.meta.url): its .ts source when the
// CLI runs from source in this repository, the .js file it is built to when it runs from dist.
export const moduleFile = (relative: string, from: string) => fileURLToPath(new URL(`${relative}${path.extname(from)}`, from))
