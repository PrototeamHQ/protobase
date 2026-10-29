// A docs page as Markdown, the way a reader of the page sees it: raw imports inlined into code blocks, live demos left out.
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

interface Page {
  title: string
  description?: string
  body: string
  filePath: string
}

const RAW_IMPORT = /^import (\w+) from '([^']+)\?raw'$/
const CODE = /^<Code code=\{(\w+)\} lang="(\w+)"(?: title="([^"]*)")? \/>$/
const LINK_CARD = /^<LinkCard title="([^"]*)" href="([^"]*)" description="([^"]*)" \/>$/
const STORY_FRAME = /^<StoryFrame .*\/>$/

export function pageMarkdown({ title, description, body, filePath }: Page) {
  const raws = new Map<string, string>()
  const lines: string[] = []
  let fence: string | undefined

  for (const line of body.split('\n')) {
    const trimmed = line.trim()
    const fenceMark = trimmed.match(/^(`{3,}|~{3,})/)?.[1]
    if (fence) {
      if (fenceMark?.startsWith(fence)) fence = undefined
      lines.push(line)
      continue
    }
    if (fenceMark) {
      fence = fenceMark
      lines.push(line)
      continue
    }

    const raw = trimmed.match(RAW_IMPORT)
    if (raw) {
      raws.set(raw[1], readFileSync(resolve(dirname(filePath), raw[2]), 'utf8'))
      continue
    }
    if (trimmed.startsWith('import ') || trimmed === '<CardGrid>' || trimmed === '</CardGrid>' || STORY_FRAME.test(trimmed)) continue

    const code = trimmed.match(CODE)
    if (code) {
      const source = raws.get(code[1])
      if (source === undefined) throw new Error(`${filePath}: <Code> uses ${code[1]}, which is not a raw import`)
      lines.push(codeBlock(source, code[2], code[3]))
      continue
    }
    const card = trimmed.match(LINK_CARD)
    if (card) {
      lines.push(`- [${card[1]}](${card[2]}): ${card[3]}`)
      continue
    }
    if (/^<\/?[A-Z]/.test(trimmed)) throw new Error(`${filePath}: no Markdown for the component in "${trimmed}"`)
    lines.push(line)
  }

  const head = description ? `# ${title}\n\n${description}\n` : `# ${title}\n`
  return `${head}\n${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`
}

// A fence longer than any backtick run in the source, so the source cannot close it.
function codeBlock(source: string, lang: string, title?: string) {
  const longest = Math.max(2, ...[...source.matchAll(/`+/g)].map((run) => run[0].length))
  const fence = '`'.repeat(longest + 1)
  const info = title ? `${lang} title="${title}"` : lang
  return `${fence}${info}\n${source.trimEnd()}\n${fence}`
}
