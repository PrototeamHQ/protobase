import { contractingRules, contractingSql, lockingRules, squawkReport } from '@protobase/server/internal'
import { breaksOlderCodeLine } from '../snapshot/header'
import type { MigrationFile } from '../snapshot/migration-files'

// What `protobase migration check` says of the files themselves: whether each says how it treats the code still
// running while it deploys, and the version before once rolled back, and whether what it says holds.

/** The line that marks a statement Protobase wrote as taking what the migration `<id>` stopped older code from using. */
const contractLine = /^-- protobase:contract (\S+)[ \t]*$/gm

const contractIds = (text: string) => [...text.matchAll(contractLine)].map((match) => match[1]!)

const handWritten = async (file: string, text: string, header: NonNullable<MigrationFile['header']>) => {
  const marks = '`-- protobase:additive` nor `-- protobase:breaks-older-code`'
  if (header.additive && header.breaksOlderCode) return [`${file} is marked both additive and as breaking older code: keep the one that holds`]
  const problems = contractIds(text).length > 0 ? [`${file} is written by hand and has \`-- protobase:contract\`, which only Protobase's own paths write: mark the file \`-- ${breaksOlderCodeLine}\` instead`] : []
  if (!header.additive && !header.breaksOlderCode) return [...problems, `${file} is written by hand and says neither ${marks}: put the one that holds among its \`-- protobase:\` lines`]
  if (!header.additive) return problems
  return [...problems, ...(await contractingSql(text)).map((line) => `${file} is marked additive and ${line}`)]
}

/**
 * The problems of the files, one line each: a hand-written one that says neither that it is additive nor that it
 * breaks older code, or says both, or has a statement marked as a contract, or is marked additive while a statement
 * does not only add; and a file Protobase wrote whose contract names no migration before it.
 */
export const lintFiles = async (files: readonly MigrationFile[]) => {
  const problems: string[] = []
  for (const [index, { file, text, header }] of files.entries()) {
    if (!header) continue
    if (header.custom) {
      problems.push(...(await handWritten(file, text, header)))
      continue
    }
    const earlier = new Set(files.slice(0, index).flatMap((before) => (before.header ? [before.header.id] : [])))
    problems.push(...contractIds(text).filter((id) => !earlier.has(id)).map((id) => `${file} has \`-- protobase:contract ${id}\`, which names no migration before it`))
  }
  return problems
}

// Whether the statement Squawk found at `line` of `lines` is marked as a contract: the lines above it, up to the end of
// the statement before, hold the mark.
const markedAt = (lines: readonly string[], line: number) => {
  for (let at = line - 1; at >= 0 && !lines[at]!.trimEnd().endsWith(';'); at--) {
    if (lines[at]!.startsWith('-- protobase:contract ')) return true
  }
  return false
}

/**
 * What the lint reports of the files Protobase wrote or that are written by hand, without failing: a statement that
 * holds a lock blocking reads while it scans or rewrites a table, and one in a file Protobase wrote that takes from
 * older code without a contract mark, which `protobase migration` checked against the database it was written from.
 */
export const fileWarnings = (files: readonly MigrationFile[]) => {
  const linted = files.filter(({ header }) => header !== undefined).map(({ file, text }) => ({ label: file, sql: text }))
  return squawkReport(linted).flatMap(({ step, rule, message, line }) => {
    const found = files.find(({ file }) => file === step)!
    const where = `${step} line ${line + 1}`
    const unmarked = !found.header!.custom && contractingRules.includes(rule) && !markedAt(found.text.split('\n'), line)
    return [...(lockingRules.includes(rule) ? [`${where} holds a lock that blocks reads while it scans or rewrites the table (${rule}): ${message}`] : []), ...(unmarked ? [`${where} takes from older code without \`-- protobase:contract\` (${rule}): ${message}`] : [])]
  })
}
