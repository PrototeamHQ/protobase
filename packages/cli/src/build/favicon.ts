import { existsSync } from 'node:fs'
import { copyFile } from 'node:fs/promises'
import path from 'node:path'
import { adminAppDir } from '../project/admin-app'
import { faviconFile } from './favicon-file'

// In a file of its own, so the serve runtime names it without loading @protobase/ui (see `adminAppDir`).
export { faviconFile }

// Protobase's own, beside the app's index.html in @protobase/ui's src and dist alike, for a project that has none.
const defaultFavicon = path.join(adminAppDir, 'favicon.svg')

/** The favicon the app shows for the project in `projectDir`: its protobase.favicon.svg, or Protobase's without one. */
export const projectFavicon = (projectDir?: string) => {
  const own = projectDir === undefined ? undefined : path.join(projectDir, faviconFile)
  return own && existsSync(own) ? own : defaultFavicon
}

/** Writes the project's favicon, or Protobase's when it has none, to `outFile`, so the app's link to it always resolves. */
export const buildFavicon = ({ projectDir, outFile }: { projectDir: string; outFile: string }) => copyFile(projectFavicon(projectDir), outFile)
