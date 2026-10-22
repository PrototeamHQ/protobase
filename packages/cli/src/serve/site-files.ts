import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { siteRoot, type StaticSite } from './static-site'

const filesIn = async (dir: string) =>
  (await readdir(dir, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))

/**
 * Every file the site serves: its path inside the app's files, such as `assets/index-abc123.js`, and the file on disk,
 * from the folder `serveStaticSite` serves that path from, so a server of its own shell lists the shell's.
 */
export const siteFiles = async (site: StaticSite) => {
  const roots = [site.publicDir, ...(site.shell ? [site.shell.dir] : [])]
  const listed = await Promise.all(roots.map(async (root) => (await filesIn(root)).filter((href) => siteRoot(site, `/${href}`) === root).map((href) => ({ href, file: path.join(root, href) }))))
  return listed.flat()
}
