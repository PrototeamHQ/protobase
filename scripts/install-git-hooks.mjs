// Points git at .githooks, whose commit-msg hook runs commitlint. Run by `pnpm install` (prepare); does nothing
// outside a git checkout of this repository.
import { spawnSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'))
const topLevel = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8' })
if (topLevel.status !== 0 || realpathSync(topLevel.stdout.trim()) !== root) process.exit(0)

const configured = spawnSync('git', ['config', 'core.hooksPath', '.githooks'], { cwd: root, stdio: 'inherit' })
process.exit(configured.status ?? 1)
