import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'

export type FunctionFile = { name: string; file: string }

// Not functions: shared code (`_shared/`, `_utils.ts`), hidden files, tests and type declarations.
const skipped = (entry: string) => entry.startsWith('_') || entry.startsWith('.') || /\.(test|spec|d)\.ts$/.test(entry)

// The project's API functions by convention, as Supabase lays out its Edge Functions: functions/<name>.ts, or
// functions/<name>/index.ts for a function of several files. Sorted by name, so builds are stable.
export const functionFiles = (projectDir: string): FunctionFile[] => {
  const dir = path.join(projectDir, 'functions')
  if (!existsSync(dir)) return []
  const found = new Map<string, string>()
  const add = (name: string, file: string) => {
    if (found.has(name)) throw new Error(`The function "${name}" is both ${found.get(name)} and ${file}; keep one of them`)
    found.set(name, file)
  }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (skipped(entry.name)) continue
    if (entry.isDirectory()) {
      const index = path.join(dir, entry.name, 'index.ts')
      if (!existsSync(index)) throw new Error(`functions/${entry.name} has no index.ts; a folder of shared code is named with a leading _, such as functions/_${entry.name}`)
      add(entry.name, index)
    } else if (entry.name.endsWith('.ts')) {
      add(entry.name.slice(0, -'.ts'.length), path.join(dir, entry.name))
    }
  }
  return [...found].map(([name, file]) => ({ name, file })).sort((a, b) => a.name.localeCompare(b.name))
}
