import { posix } from 'node:path'

const docsOrigin = 'https://docs.protobase.net'

// A page's text with its links to other pages made relative to its own file, and the other links absolute. Lines
// inside fenced blocks stay as they are.
export function linked(page: { path: string; markdown: string }, paths: Set<string>) {
  const from = posix.dirname(`${page.path}.md`)
  const link = (_: string, target: string, anchor = '') => {
    const path = target.replace(/\/$/, '')
    if (!paths.has(path)) return `](${docsOrigin}/${target}${anchor})`
    return `](${posix.relative(from, `${path}.md`)}${anchor})`
  }
  let fence: string | undefined
  return page.markdown
    .split('\n')
    .map((line) => {
      const fenceMark = line.trim().match(/^(`{3,}|~{3,})/)?.[1]
      if (fence) {
        if (fenceMark?.startsWith(fence)) fence = undefined
        return line
      }
      if (fenceMark) {
        fence = fenceMark
        return line
      }
      return line.replace(/\]\(\/([^)#]*)(#[^)]*)?\)/g, link)
    })
    .join('\n')
}
