// `bun run runner:build`: dist/protobase-runner-linux-x64 and dist/protobase-runner-linux-arm64, the runner compiled
// with Bun into one executable each, which needs nothing installed on the machine; Bun cross-compiles both from any host.
import { mkdirSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const root = path.join(import.meta.dirname, '..')
const dist = path.join(root, 'dist')
rmSync(dist, { recursive: true, force: true })
mkdirSync(dist, { recursive: true })
for (const arch of ['x64', 'arm64']) {
  const outfile = path.join(dist, `protobase-runner-linux-${arch}`)
  execFileSync('bun', ['build', '--compile', `--target=bun-linux-${arch}`, '--outfile', outfile, path.join(root, 'src', 'main.ts')], { cwd: root, stdio: 'inherit' })
}
console.log(`wrote ${path.relative(process.cwd(), dist)}: protobase-runner-linux-x64 and protobase-runner-linux-arm64`)
