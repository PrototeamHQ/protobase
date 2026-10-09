// Prints the CHANGELOG.md section of one version, without its heading, as the notes of its GitHub release:
// `node scripts/release-notes.mjs 0.1.0`.
import { readFileSync } from 'node:fs'

const version = process.argv[2]
if (!version) throw new Error('usage: node scripts/release-notes.mjs <version>')

const sections = readFileSync('CHANGELOG.md', 'utf8').split(/^(?=## )/m)
const section = sections.find((text) => text.startsWith(`## ${version} `) || text.startsWith(`## [${version}]`))
if (!section) throw new Error(`CHANGELOG.md has no section for ${version}`)
process.stdout.write(`${section.slice(section.indexOf('\n') + 1).trim()}\n`)
