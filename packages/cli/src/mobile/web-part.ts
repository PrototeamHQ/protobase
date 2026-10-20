import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { apiOriginMeta } from '@protobase/schema/internal'
import { bundleLayout } from '../bundle/manifest'
import { buildDeployBundle, type DeployBundleInput } from '../build/deploy-bundle'
import type { Extension } from '../project/extensions'

/** The workspace folder Capacitor copies into the app (its `webDir`): only the files a bundle serves from `public/`. */
export const webPartDir = 'web'

const escapeAttribute = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** The page naming the API origin the shell calls, in the `<meta>` tag the shell reads (see `apiOriginMeta`). */
export const withApiOrigin = (html: string, origin: string) => {
  const at = html.indexOf('</head>')
  if (at < 0) throw new Error('The shell\'s index.html has no </head> to name the API origin in')
  return `${html.slice(0, at)}<meta name="${apiOriginMeta}" content="${escapeAttribute(origin)}">${html.slice(at)}`
}

export type WebPartInput = {
  projectDir: string
  /** The mobile workspace. */
  ws: string
  extensions: Extension[]
  apiOrigin: string
  build?: (input: DeployBundleInput) => Promise<unknown>
  onWarning?: (message: string) => void
}

/**
 * The app's files: the deploy bundle's `public/` (the shell, the project's UI plugins, theme and favicon), its
 * index.html naming the API origin. The bundle is built beside it and removed, so its server config module and
 * packages never sit where Capacitor copies from.
 */
export const buildWebPart = async ({ projectDir, ws, extensions, apiOrigin, build = buildDeployBundle, onWarning }: WebPartInput) => {
  const bundle = path.join(ws, 'bundle')
  const web = path.join(ws, webPartDir)
  await rm(bundle, { recursive: true, force: true })
  await build({ projectDir, outDir: bundle, extensions, ...(onWarning && { onWarning }) })
  await rm(web, { recursive: true, force: true })
  await cp(path.join(bundle, bundleLayout.public), web, { recursive: true })
  await rm(bundle, { recursive: true, force: true })
  const index = path.join(web, bundleLayout.spa)
  await writeFile(index, withApiOrigin(await readFile(index, 'utf8'), apiOrigin))
}

/** A stand-in for the app's files with `--live`, where the app opens `protobase dev` and never shows them. */
export const placeholderWebPart = async (ws: string) => {
  const web = path.join(ws, webPartDir)
  await rm(web, { recursive: true, force: true })
  await mkdir(web, { recursive: true })
  await writeFile(path.join(web, bundleLayout.spa), '<!doctype html><title>protobase dev</title>\n')
}
