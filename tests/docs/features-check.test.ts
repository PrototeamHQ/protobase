import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { pageProblems } from '../../scripts/features-check'

const root = path.resolve(__dirname, '../..')

describe('the features pages', () => {
  it('keep their rules in this repository', async () => {
    expect(await pageProblems(root)).toEqual([])
  })
})

// scripts/features-check.ts on a docs site of its own: one area page, one reference page and one guide.
describe('scripts/features-check.ts', () => {
  let site = ''
  beforeEach(async () => {
    site = await mkdtemp(path.join(tmpdir(), 'protobase-features-'))
    await write(
      'docs/website/sidebar.mjs',
      `export const features = ['features/lists']
export const guides = ['guides/tutorial']
export const reference = ['reference/ui-config']
export const architecture = ['reference/architecture']`,
    )
    await write('docs/website/src/content/docs/features.md', page('Features', '- [Lists](/features/lists/): The list page.'))
    await write('docs/website/src/content/docs/features/lists.md', page('Lists', '- [Filters](/reference/ui-config/#filters-and-the-chart): Value menus.'))
    await write('docs/website/src/content/docs/reference/ui-config.mdx', page('UI config', '## Names and columns\n\n## Filters and the chart\n\n```md\n## Not a heading\n```'))
    await write('docs/website/src/content/docs/reference/architecture.md', page('Architecture', '## Packages'))
    await write('docs/website/src/content/docs/guides/tutorial.md', page('A tutorial', '## 1. A step'))
    await write('docs/website/src/content/docs/guides/index.mdx', page('Guides', '<LinkCard title="A tutorial" href="/guides/tutorial/" description="A tutorial." />'))
  })
  afterEach(() => rm(site, { recursive: true, force: true }))

  const write = async (file: string, text: string) => {
    await mkdir(path.dirname(path.join(site, file)), { recursive: true })
    await writeFile(path.join(site, file), text)
  }
  const page = (title: string, body: string) => `---\ntitle: ${title}\ndescription: ${title}.\n---\n\n${body}\n`
  const areaPage = (body: string) => write('docs/website/src/content/docs/features/lists.md', page('Lists', body))
  const problems = () => pageProblems(site)

  it('accepts linked and plain entries, stabilities and subareas', async () => {
    await areaPage(
      [
        '- [Filters](/reference/ui-config/#filters-and-the-chart): Value menus.',
        '- [Names](/reference/ui-config/) (beta): Singular and plural names.',
        '',
        '## A subarea',
        '',
        '- Safe deletes (in development): Deleting asks first.',
        '- Bulk edit (coming soon): Change many records at once.',
        '- [Saved filters](/reference/ui-config/#names-and-columns) (coming soon): Named filters.',
      ].join('\n'),
    )
    expect(await problems()).toEqual([])
  })

  it('refuses a line that is no entry, naming its file and line', async () => {
    await areaPage('- [Filters](/reference/ui-config/#filters-and-the-chart): Value menus.\n- Without a colon\nSome prose.\n### A deeper heading')
    expect(await problems()).toEqual([
      'docs/website/src/content/docs/features/lists.md:7: not an entry: - Without a colon',
      'docs/website/src/content/docs/features/lists.md:8: not an entry: Some prose.',
      'docs/website/src/content/docs/features/lists.md:9: not an entry: ### A deeper heading',
    ])
  })

  it('refuses an unknown stability, and a coming soon entry that links a whole page', async () => {
    await areaPage('- [Filters](/reference/ui-config/#filters-and-the-chart) (betta): Value menus.\n- [Names](/reference/ui-config/) (coming soon): Names.')
    expect(await problems()).toEqual([
      'docs/website/src/content/docs/features/lists.md:6: unknown stability "betta", use beta, in development, coming soon or none for stable',
      'docs/website/src/content/docs/features/lists.md:7: a coming soon entry links a whole page; link the section that describes it, or nothing',
    ])
  })

  it('refuses a link to a page or heading that does not exist, or that is not a site path', async () => {
    await areaPage(
      [
        '- [Filters](/reference/ui-config/#filterz): Value menus.',
        '- [Code](/reference/ui-config/#not-a-heading): A heading in a fenced block.',
        '- [Gone](/reference/gone/): A page that is not there.',
        '- [Relative](../reference/ui-config/): A relative link.',
      ].join('\n'),
    )
    expect(await problems()).toEqual([
      'docs/website/src/content/docs/features/lists.md:6: links /reference/ui-config/#filterz, but reference/ui-config has no heading #filterz',
      'docs/website/src/content/docs/features/lists.md:7: links /reference/ui-config/#not-a-heading, but reference/ui-config has no heading #not-a-heading',
      'docs/website/src/content/docs/features/lists.md:8: links /reference/gone/, but there is no page reference/gone',
      'docs/website/src/content/docs/features/lists.md:9: link ../reference/ui-config/ is not a site path such as /reference/api/#routes',
    ])
  })

  it('refuses an area page that is not in the sidebar or not linked from the features page', async () => {
    await write('docs/website/src/content/docs/features/maps.md', page('Maps', '- Maps: Records on a map.'))
    await write('docs/website/src/content/docs/features.md', page('Features', 'No areas.'))
    expect(await problems()).toEqual([
      'docs/website/src/content/docs/features/maps: not in the sidebar: add it to `features` in docs/website/sidebar.mjs',
      'docs/website/src/content/docs/features.md: does not link features/lists',
    ])
  })

  it('refuses a reference page that no entry links, but not a guide or a page that explains no feature', async () => {
    await write('docs/website/src/content/docs/reference/maps.md', page('Maps', '## Pins'))
    await write(
      'docs/website/sidebar.mjs',
      `export const features = ['features/lists']
export const guides = ['guides/tutorial']
export const reference = ['reference/ui-config', 'reference/maps']
export const architecture = ['reference/architecture']`,
    )
    expect(await problems()).toEqual(['docs/website/sidebar.mjs: no feature entry links reference/maps: add the features it explains to their area page'])
  })

  it('refuses a guide the guides page does not link', async () => {
    await write('docs/website/src/content/docs/guides/maps.md', page('Maps', '## 1. A pin'))
    expect(await problems()).toEqual(['docs/website/src/content/docs/guides/index.mdx: does not link guides/maps'])
  })
})
