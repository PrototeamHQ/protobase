import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { baselineCheckout } from './lib/baseline-storybook.mjs'
import { pluginStylesheet } from './lib/plugin-stylesheet.mjs'
import { storyLayouts } from './lib/story-layouts.mjs'

/**
 * Checks the layout of the main pages in the built Storybook (storybook-static) against the snapshots saved in
 * scripts/dom-snapshots/layouts, with a plugin's stylesheet loaded after the app's as the app loads one. A snapshot is
 * the element tree with classes, roles and the computed CSS that places each element (see layout-tree.mjs).
 *
 * A page whose layout changed fails with the changed lines, and gets before and after screenshots in
 * screenshots/dom/: after from this Storybook, before from one built at the commit that last saved the snapshots.
 * They show whether the change is the one intended; `--update` then saves the new layouts. `--no-screenshots` only
 * compares.
 */
const root = join(import.meta.dirname, '..')
const layoutsDir = join(root, 'scripts/dom-snapshots/layouts')
const outDir = join(root, 'screenshots/dom')
const update = process.argv.includes('--update')
const screenshots = !process.argv.includes('--no-screenshots')

const pages = [
  { story: 'guides-bike-shop--step-3', page: 'list-with-filters' },
  { story: 'list-page-displays--cards', page: 'list-with-cards' },
  { story: 'guides-bike-shop--step-5', page: 'record-with-actions' },
]
const shots = pages.flatMap(({ story, page }) => ['desktop', 'phone'].map((viewport) => ({ name: `${page}.${viewport}`, story, viewport })))
const layoutFile = (name) => join(layoutsDir, `${name}.txt`)

const storybookDir = join(root, 'storybook-static')
if (!existsSync(join(storybookDir, 'index.json'))) throw new Error('There is no built Storybook in storybook-static; run `bun run build-storybook` first')
const css = await pluginStylesheet(root)
const trees = await storyLayouts({ storybookDir, css, shots })

if (update) {
  await rm(layoutsDir, { recursive: true, force: true })
  await mkdir(layoutsDir, { recursive: true })
  for (const [name, tree] of Object.entries(trees)) await writeFile(layoutFile(name), tree)
  console.log(`Saved ${shots.length} layouts in ${layoutsDir}`)
  process.exit(0)
}

// Each changed page, with the lines that changed as git shows them; a page without a saved layout is changed too.
await rm(outDir, { recursive: true, force: true })
await mkdir(outDir, { recursive: true })
const changed = []
for (const shot of shots) {
  const saved = existsSync(layoutFile(shot.name)) ? await readFile(layoutFile(shot.name), 'utf8') : undefined
  if (saved === trees[shot.name]) {
    console.log(`PASS ${shot.name}`)
    continue
  }
  changed.push(shot)
  const current = join(outDir, `${shot.name}.txt`)
  await writeFile(current, trees[shot.name])
  const diff = spawnSync('git', ['diff', '--no-index', '--no-color', '--unified=2', saved === undefined ? '/dev/null' : layoutFile(shot.name), current], { encoding: 'utf8' }).stdout
  console.log(`FAIL ${shot.name}${saved === undefined ? ' has no saved layout' : ''}\n${diff}`)
}
const saved = new Set(shots.map((shot) => `${shot.name}.txt`))
const stale = (existsSync(layoutsDir) ? await readdir(layoutsDir) : []).filter((file) => !saved.has(file))
for (const file of stale) console.log(`FAIL ${file} is saved for no page`)
if (changed.length === 0 && stale.length === 0) process.exit(0)

process.exitCode = 1
console.log('A changed layout is either a regression to fix or an intended change to save with `bun run test:dom:update`.')
if (!screenshots || changed.length === 0) process.exit()

// Before: the Storybook and plugin build of the commit that last saved the layouts; after: this checkout's.
const shot = (side) => (name) => join(outDir, `${name}.${side}.png`)
await storyLayouts({ storybookDir, css, shots: changed, screenshots: shot('after') })
const sha = execFileSync('git', ['log', '-1', '--format=%H', '--', layoutsDir], { cwd: root, encoding: 'utf8' }).trim()
if (!sha) {
  console.log(`No commit has saved layouts yet, so only the after screenshots are in ${outDir}`)
  process.exit()
}
const baseline = await baselineCheckout(root, sha)
await storyLayouts({ storybookDir: join(baseline, 'storybook-static'), css: await pluginStylesheet(baseline), shots: changed, screenshots: shot('before') })
console.log(`Before (${sha.slice(0, 12)}) and after screenshots of each changed page are in ${outDir}`)
