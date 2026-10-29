import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { releaseManifestFile } from '@protobase/schema/internal'
import { releaseManifest, releaseOrder, withApiOrigin } from '@protobase/server/mobile-release'
import { bundleLayout, readManifest } from '../bundle/manifest'
import { buildDeployBundle, type DeployBundleInput } from '../build/deploy-bundle'
import type { Extension } from '../project/extensions'
import { siteFiles } from '../serve/site-files'

/** The workspace folder Capacitor copies into the app (its `webDir`): only the files a bundle serves from `public/`. */
export const webPartDir = 'web'

export type WebPartInput = {
  projectDir: string
  /** The mobile workspace. */
  ws: string
  extensions: Extension[]
  apiOrigin: string
  build?: (input: DeployBundleInput) => Promise<unknown>
  onWarning?: (message: string) => void
}

// The updater's manifest of the app's files, which an update compares with its own to copy the files that did not
// change from the app instead of downloading them.
const writeReleaseManifest = async (web: string) => {
  const files = await Promise.all((await siteFiles({ publicDir: web, spa: bundleLayout.spa })).map(async ({ href, file }) => ({ href, content: new Uint8Array(await readFile(file)) })))
  await writeFile(path.join(web, releaseManifestFile), JSON.stringify(releaseManifest(files)))
}

/**
 * The app's files: the deploy bundle's `public/` (the shell, the project's UI plugins, theme and favicon), its
 * index.html naming the API origin, and the updater's manifest of them. The bundle is built beside it and removed, so
 * its server config module and packages never sit where Capacitor copies from. Gives the files' release order, as a
 * server computes it for the same bundle with its own copy of the shell, `undefined` when the bundle names no build
 * time: the live updater takes only a release above it.
 */
export const buildWebPart = async ({ projectDir, ws, extensions, apiOrigin, build = buildDeployBundle, onWarning }: WebPartInput) => {
  const bundle = path.join(ws, 'bundle')
  const web = path.join(ws, webPartDir)
  await rm(bundle, { recursive: true, force: true })
  await build({ projectDir, outDir: bundle, extensions, ...(onWarning && { onWarning }) })
  const { builtAt } = await readManifest(bundle)
  await rm(web, { recursive: true, force: true })
  await cp(path.join(bundle, bundleLayout.public), web, { recursive: true })
  await rm(bundle, { recursive: true, force: true })
  const index = path.join(web, bundleLayout.spa)
  await writeFile(index, withApiOrigin(await readFile(index, 'utf8'), apiOrigin))
  await writeReleaseManifest(web)
  return { builtInOrder: releaseOrder(builtAt === undefined ? {} : { builtAt }) }
}

/** A stand-in for the app's files with `--live`, where the app opens `protobase dev` and never shows them. */
export const placeholderWebPart = async (ws: string) => {
  const web = path.join(ws, webPartDir)
  await rm(web, { recursive: true, force: true })
  await mkdir(web, { recursive: true })
  await writeFile(path.join(web, bundleLayout.spa), '<!doctype html><title>protobase dev</title>\n')
  return { builtInOrder: undefined }
}
