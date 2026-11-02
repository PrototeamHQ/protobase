// Puts the protobase agent skill on the built docs site at /skills/protobase/, where llms.txt links it, and fails when
// the site lacks llms.txt or a file it or SKILL.md links. `bun run docs:build` runs it after `bun run docs:skill`
// wrote the skill's references.
import { cp } from 'node:fs/promises'
import { join } from 'node:path'
import { missing } from './docs-agent-files/missing'

const root = join(import.meta.dir, '..')
const dist = join(root, 'docs/website/dist')

await cp(join(root, 'packages/cli/skills/protobase'), join(dist, 'skills/protobase'), { recursive: true })

const found = missing(dist)
if (found.length) {
  console.error(`The docs site lacks what llms.txt points chat assistants at:\n${found.join('\n')}`)
  process.exit(1)
}
