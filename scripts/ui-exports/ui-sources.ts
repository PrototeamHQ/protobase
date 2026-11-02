import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Sources } from './building-blocks'

// The modules @protobase/ui builds, as its tsdown config picks them: no tests, stories or their fakes.
const isModule = (path: string) => /\.tsx?$/.test(path) && !/\.(test|stories)\.tsx?$/.test(path) && !path.endsWith('.d.ts') && !path.startsWith('app/testing/')

/** Every module of @protobase/ui's source under `src`, by its path there. */
export const uiSources = (src: string): Sources => {
  const paths = readdirSync(src, { recursive: true, encoding: 'utf8' }).filter(isModule)
  return Object.fromEntries(paths.map((path) => [path, readFileSync(join(src, path), 'utf8')]))
}
