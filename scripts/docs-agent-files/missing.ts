import { existsSync, readFileSync } from 'node:fs'
import { join, posix } from 'node:path'

const origin = 'https://docs.protobase.net'

// What a built docs site (`dist`) lacks of what chat assistants are pointed at: llms.txt, every page of this site it
// links, the protobase skill's SKILL.md among them, and every file SKILL.md links relative to itself.
export function missing(dist: string) {
  const llms = join(dist, 'llms.txt')
  if (!existsSync(llms)) return ['/llms.txt']
  const found: string[] = []
  const check = (path: string) => {
    if (!existsSync(join(dist, path))) found.push(path)
  }
  const links = [...readFileSync(llms, 'utf8').matchAll(/\]\(([^)#]+)(?:#[^)]*)?\)/g)].map((match) => match[1]!)
  const paths = links.filter((link) => link.startsWith(`${origin}/`)).map((link) => link.slice(origin.length))
  paths.forEach(check)

  const skill = paths.find((path) => path.endsWith('/SKILL.md'))
  if (!skill) return [...found, 'a link to SKILL.md in /llms.txt']
  if (found.includes(skill)) return found
  const relative = [...readFileSync(join(dist, skill), 'utf8').matchAll(/\]\(([^)#:]+)(?:#[^)]*)?\)/g)].map((match) => match[1]!)
  for (const link of relative) check(posix.join(posix.dirname(skill), link))
  return found
}
