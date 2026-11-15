import type { DiffLine } from './diff'
import { readQuoted } from './quoted-path'

// A unified patch, as `diff -u` and `git diff` write it (https://www.gnu.org/software/diffutils/manual/html_node/Detailed-Unified.html):
// files, each with `---`/`+++` names or a `diff --git` line and its extended headers, then hunks whose `@@` line counts
// the lines that follow. Text before the first file is skipped, as `patch` skips it.

/** One file of a patch: its name, and its lines with each hunk's `@@` line before them. */
export type PatchFile = { path: string; lines: DiffLine[] }

const hunkHeader = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/
const extendedHeader = /^(index |old mode |new mode |deleted file mode |new file mode |similarity index |dissimilarity index |rename from |rename to |copy from |copy to |Binary files )/

// A name as `---` or `+++` gives it: no `a/` or `b/`, no timestamp after a tab; none for /dev/null
const fileName = (line: string) => {
  const quoted = readQuoted(line.slice(4))
  const name = quoted ? quoted.path : line.slice(4).split('\t')[0]!
  if (name === '/dev/null') return
  return name.replace(/^[ab]\//, '')
}

// The old and new names of a `diff --git` line, without their `a/` and `b/`
type GitNames = { old: string; new: string }

const gitSides = (old: string, next: string): GitNames | undefined => {
  const quotedNew = readQuoted(next)
  if (quotedNew && quotedNew.rest !== '') return
  const newPath = quotedNew ? quotedNew.path : next
  if (!old.startsWith('a/') || !newPath.startsWith('b/')) return
  return { old: old.slice(2), new: newPath.slice(2) }
}

// Each side is quoted or plain, and a plain one holds no quote. Plain names holding ` b/` split more than one way: the split
// whose halves are equal, as git writes a file that keeps its name, else the last; a rename's own lines then give its names
const gitNames = (line: string) => {
  if (!line.startsWith('diff --git ')) return
  const names = line.slice('diff --git '.length)
  const quotedOld = readQuoted(names)
  if (quotedOld) return quotedOld.rest.startsWith(' ') ? gitSides(quotedOld.path, quotedOld.rest.slice(1)) : undefined
  const quotedNewAt = names.indexOf(' "b/')
  if (quotedNewAt !== -1) return gitSides(names.slice(0, quotedNewAt), names.slice(quotedNewAt + 1))
  const splits = [...names.matchAll(/ b\//g)].map((match) => [names.slice(0, match.index), names.slice(match.index + 1)] as const)
  const split = splits.find(([old, next]) => old.slice(2) === next.slice(2)) ?? splits.at(-1)
  return split && gitSides(...split)
}

// The name a `rename from`, `rename to`, `copy from` or `copy to` line gives in full, quoted or plain
const extendedName = (line: string, prefixes: string[]) => {
  const prefix = prefixes.find((candidate) => line.startsWith(candidate))
  if (prefix === undefined) return
  const name = line.slice(prefix.length)
  return readQuoted(name)?.path ?? name
}

const startsFile = (lines: string[], index: number) => gitNames(lines[index]!) !== undefined || (lines[index]!.startsWith('--- ') && lines[index + 1]?.startsWith('+++ ') === true)

/** The files of a unified patch, or `undefined` when the text is not one. */
export const parsePatch = (text: string): PatchFile[] | undefined => {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  if (lines.at(-1) === '') lines.pop()
  let index = 0
  while (index < lines.length && !startsFile(lines, index)) index++
  const files: PatchFile[] = []
  // The names of the file last opened by a `diff --git` line while it still waits for its `---`/`+++` lines
  let pending: GitNames | undefined
  while (index < lines.length) {
    const line = lines[index]!
    const current = files.at(-1)
    // `git format-patch` ends with its version under a signature line
    if (line === '-- ') break
    const git = gitNames(line)
    if (git !== undefined) {
      files.push({ path: git.new, lines: [] })
      pending = git
      index++
      continue
    }
    if (line.startsWith('--- ') && lines[index + 1]?.startsWith('+++ ')) {
      const oldName = fileName(line)
      const newName = fileName(lines[index + 1]!)
      // They are the waiting file's when both name it exactly, /dev/null standing for an added or deleted side; otherwise a
      // file without them, such as a rename alone, came before
      const theirs = pending !== undefined && (oldName ?? pending.old) === pending.old && (newName ?? pending.new) === pending.new
      if (!theirs) files.push({ path: newName ?? oldName ?? '', lines: [] })
      pending = undefined
      index += 2
      continue
    }
    if (current && current.lines.length === 0 && extendedHeader.test(line)) {
      const from = extendedName(line, ['rename from ', 'copy from '])
      const to = extendedName(line, ['rename to ', 'copy to '])
      if (pending && from !== undefined) pending.old = from
      if (pending && to !== undefined) {
        pending.new = to
        current.path = to
      }
      index++
      continue
    }
    const hunk = hunkHeader.exec(line)
    if (!current || !hunk) return
    pending = undefined
    current.lines.push({ kind: 'hunk', text: line })
    let oldNo = Number(hunk[1])
    let newNo = Number(hunk[3])
    let oldLeft = hunk[2] === undefined ? 1 : Number(hunk[2])
    let newLeft = hunk[4] === undefined ? 1 : Number(hunk[4])
    index++
    while (oldLeft > 0 || newLeft > 0) {
      const body = lines[index]
      if (body === undefined) return
      index++
      if (body.startsWith('\\')) continue
      if (body.startsWith('+')) {
        current.lines.push({ kind: 'add', text: body.slice(1), newNo: newNo++ })
        newLeft--
      } else if (body.startsWith('-')) {
        current.lines.push({ kind: 'del', text: body.slice(1), oldNo: oldNo++ })
        oldLeft--
      } else if (body.startsWith(' ') || body === '') {
        // An empty context line, whose space an editor trimmed, is read as `git apply` reads it
        current.lines.push({ kind: 'ctx', text: body.slice(1), oldNo: oldNo++, newNo: newNo++ })
        oldLeft--
        newLeft--
      } else return
      if (oldLeft < 0 || newLeft < 0) return
    }
    // "\ No newline at end of file" after a hunk's last line
    while (lines[index]?.startsWith('\\')) index++
  }
  return files.length > 0 ? files : undefined
}
