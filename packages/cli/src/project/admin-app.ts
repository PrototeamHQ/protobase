import { createRequire } from 'node:module'
import path from 'node:path'

// @protobase/ui as the CLI's dependency resolves it, symlinks resolved: its src/index.ts.
const uiEntry = createRequire(import.meta.url).resolve('@protobase/ui')

// The folder of @protobase/ui, which `protobase dev` lets Vite serve files from.
export const uiPackageDir = path.resolve(path.dirname(uiEntry), '..')

// The admin UI that `protobase dev` serves and `protobase build` bundles.
export const adminAppDir = path.join(path.dirname(uiEntry), 'app')
