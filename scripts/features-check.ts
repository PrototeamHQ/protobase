// Holds the features pages to their rules (CONTRIBUTING.md, "Features and docs"): website/src/content/docs/features.md
// links one page per area, and each area page under features/ lists that area's features, one entry per line:
//
//   - [Name](/page/#anchor) (stability): one or two plain sentences.
//   - Name (stability): one or two plain sentences.
//
// with `## Subarea` headings between them where an area has them. The stability is left out for a stable feature, and is
// otherwise beta, in development or coming soon. It checks that every entry keeps that grammar and links a heading of a
// docs page that exists, that every area page is in the sidebar's `features` list and linked from features.md, and that
// every reference page is linked by an entry, so a new one cannot ship without its feature. The guides page,
// guides/index.mdx, must link every guide under guides/.
//
// With --release-rule it also refuses a release with a `feat` commit that changes no docs page: from the last vx.y.z tag
// reachable from HEAD, any `feat` commit but those of the example apps needs a change under website/src/content/docs/
// outside api/, which TypeDoc writes. The rule is off until every feature already released is documented.
//
//   bun run features:check [--release-rule]
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

const stabilities = ['beta', 'in development', 'coming soon']
const entryPattern = /^- (?:\[(?<linked>[^\]]+)\]\((?<link>[^)\s]*)\)|(?<plain>[^\s[(:][^(:]*?))(?: \((?<stability>[^)]+)\))?: (?<text>\S.*)$/
const linkPattern = /^\/(?<page>(?:[a-z0-9-]+\/)*[a-z0-9-]+)\/(?:#(?<anchor>[a-z0-9_-]+))?$/
// Pages that explain no feature of their own: how the packages fit together, for contributors.
const notFeatures = ['reference/architecture']

// The problems of the features pages of the repository at `root`, each naming its file and line.
export async function pageProblems(root: string) {
  const docs = path.join(root, 'website/src/content/docs')
  const sidebar: Record<'features' | 'guides' | 'reference' | 'startHere', string[]> = await import(pathToFileURL(path.join(root, 'website/sidebar.mjs')).href)
  const { features, guides, reference, startHere } = sidebar
  const problems: string[] = []
  const anchors = new Map<string, Set<string> | undefined>()
  const headingsOf = (page: string) => {
    if (!anchors.has(page)) anchors.set(page, pageAnchors(docs, page))
    return anchors.get(page)
  }

  const areaFiles = readdirSync(path.join(docs, 'features')).filter((file) => /\.mdx?$/.test(file))
  for (const file of areaFiles) {
    const page = `features/${file.replace(/\.mdx?$/, '')}`
    if (!features.includes(page)) problems.push(`website/src/content/docs/${page}: not in the sidebar: add it to \`features\` in website/sidebar.mjs`)
  }
  if (!startHere.includes('features')) problems.push('website/sidebar.mjs: the features page is not in `startHere`')

  const index = readFileSync(path.join(docs, 'features.md'), 'utf8')
  const indexed = new Set([...index.matchAll(/\]\(\/(features\/[a-z0-9-]+)\/\)/g)].map((match) => match[1]))
  const linkedPages = new Set<string>()
  for (const page of features) {
    const file = pageFile(docs, page)
    if (!file) {
      problems.push(`website/sidebar.mjs: ${page} has no page`)
      continue
    }
    if (!indexed.has(page)) problems.push(`website/src/content/docs/features.md: does not link ${page}`)
    const relative = path.relative(root, file)
    for (const { line, number } of bodyLines(readFileSync(file, 'utf8'))) {
      const at = `${relative}:${number}`
      if (line.trim() === '' || /^## \S/.test(line)) continue
      const entry = entryPattern.exec(line)
      if (!entry) {
        problems.push(`${at}: not an entry: ${line.slice(0, 80)}`)
        continue
      }
      const { link, stability } = entry.groups ?? {}
      if (stability !== undefined && !stabilities.includes(stability)) problems.push(`${at}: unknown stability "${stability}", use ${stabilities.join(', ')} or none for stable`)
      if (link === undefined) continue
      const target = linkPattern.exec(link)
      if (!target) {
        problems.push(`${at}: link ${link} is not a site path such as /reference/api/#routes`)
        continue
      }
      const { page: linked = '', anchor } = target.groups ?? {}
      const headings = headingsOf(linked)
      if (!headings) {
        problems.push(`${at}: links ${link}, but there is no page ${linked}`)
        continue
      }
      linkedPages.add(linked)
      if (anchor !== undefined && !headings.has(anchor)) problems.push(`${at}: links ${link}, but ${linked} has no heading #${anchor}`)
      if (stability === 'coming soon' && anchor === undefined) problems.push(`${at}: a coming soon entry links a whole page; link the section that describes it, or nothing`)
    }
  }

  for (const page of [...startHere, ...reference]) {
    if (page === 'features' || notFeatures.includes(page) || linkedPages.has(page)) continue
    problems.push(`website/sidebar.mjs: no feature entry links ${page}: add the features it explains to their area page`)
  }
  for (const page of guides) {
    if (!pageFile(docs, page)) problems.push(`website/sidebar.mjs: ${page} has no page`)
  }

  // deploy is a guide too, though the sidebar lists it under startHere.
  const guidesIndex = path.join(docs, 'guides/index.mdx')
  if (!existsSync(guidesIndex)) return [...problems, 'website/src/content/docs/guides/index.mdx: no guides page']
  const listed = new Set([...readFileSync(guidesIndex, 'utf8').matchAll(/href="\/(guides\/[a-z0-9-]+)\/"/g)].map((match) => match[1]))
  const guideFiles = readdirSync(path.join(docs, 'guides')).filter((file) => /\.mdx?$/.test(file) && file !== 'index.mdx')
  for (const file of guideFiles) {
    const page = `guides/${file.replace(/\.mdx?$/, '')}`
    if (!listed.has(page)) problems.push(`website/src/content/docs/guides/index.mdx: does not link ${page}`)
  }
  return problems
}

// The problems of releasing HEAD of the repository `cwd` is in: a `feat` commit since the last release, but those of the
// example apps, with no docs page changed since then.
export function releaseProblems(cwd: string) {
  const git = (...args: string[]) => {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
    if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed with status ${result.status}`)
    return result.stdout.trim()
  }
  const lastTag = git('tag', '--list', 'v[0-9]*', '--sort=-v:refname', '--merged', 'HEAD')
    .split('\n')
    .find((tag) => /^v\d+\.\d+\.\d+$/.test(tag))
  const range = lastTag ? [`${lastTag}..HEAD`] : ['HEAD']
  const features = git('log', '--format=%h %s', ...range)
    .split('\n')
    .filter((line) => /^\S+ feat(\((?!(examples|property-portal|erp)\))[^)]*\))?!?: /.test(line))
  if (features.length === 0) return []
  const changed = lastTag
    ? git('diff', '--name-only', lastTag, 'HEAD', '--', 'website/src/content/docs')
    : git('ls-tree', '-r', '--name-only', 'HEAD', '--', 'website/src/content/docs')
  const docs = changed.split('\n').filter((file) => file !== '' && !file.startsWith('website/src/content/docs/api/'))
  if (docs.length > 0) return []
  return [`features with no docs change since ${lastTag ?? 'the first commit'}: ${features.join('; ')}. Document them in website/src/content/docs (CONTRIBUTING.md, Features and docs)`]
}

const pageFile = (docs: string, page: string) =>
  [`${page}.md`, `${page}.mdx`, `${page}/index.md`, `${page}/index.mdx`].map((file) => path.join(docs, file)).find((file) => existsSync(file))

// The page's lines after its frontmatter, numbered as in the file.
function bodyLines(text: string) {
  const lines = text.split('\n')
  const end = lines[0] === '---' ? lines.indexOf('---', 1) + 1 : 0
  return lines.slice(end).map((line, i) => ({ line, number: end + i + 1 }))
}

// The anchors of a docs page's headings, as Starlight writes them, or undefined when there is no such page. Headings in
// fenced blocks are code, not headings.
function pageAnchors(docs: string, page: string) {
  const file = pageFile(docs, page)
  if (!file) return undefined
  const seen = new Map<string, number>()
  const anchors = new Set<string>()
  let fence: string | undefined
  for (const { line } of bodyLines(readFileSync(file, 'utf8'))) {
    const fenceMark = line.trim().match(/^(`{3,}|~{3,})/)?.[1]
    if (fence) {
      if (fenceMark?.startsWith(fence)) fence = undefined
      continue
    }
    if (fenceMark) {
      fence = fenceMark
      continue
    }
    const heading = /^#{1,6} (.+)$/.exec(line)?.[1]
    if (!heading) continue
    const base = slug(heading)
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    anchors.add(count === 0 ? base : `${base}-${count}`)
  }
  return anchors
}

// A heading's anchor as github-slugger makes it, which Starlight uses: the heading's text, lowercased, without
// punctuation, with spaces as dashes.
const slug = (heading: string) =>
  heading
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M} _-]/gu, '')
    .replace(/ /g, '-')

if (import.meta.main) {
  const { values } = parseArgs({ options: { 'release-rule': { type: 'boolean' } } })
  const root = path.join(import.meta.dirname, '..')
  const problems = [...(await pageProblems(root)), ...(values['release-rule'] ? releaseProblems(root) : [])]
  if (problems.length > 0) {
    console.error(problems.join('\n'))
    process.exit(1)
  }
  console.log('The features pages keep their rules')
}
