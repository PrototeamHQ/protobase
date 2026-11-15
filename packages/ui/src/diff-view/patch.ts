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

// The new name a `diff --git` line gives, without its `b/`; each side is quoted or plain, and a plain one holds no quote
const gitPath = (line: string) => {
  if (!line.startsWith('diff --git ')) return
  const names = line.slice('diff --git '.length)
  const quotedOld = readQuoted(names)
  if (quotedOld && !(quotedOld.path.startsWith('a/') && quotedOld.rest.startsWith(' '))) return
  const quotedNewAt = names.indexOf(' "b/')
  const newName = quotedOld ? quotedOld.rest.slice(1) : quotedNewAt === -1 ? /^a\/.+ (b\/.+)$/.exec(names)?.[1] : names.slice(quotedNewAt + 1)
  if (newName === undefined) return
  const quotedNew = readQuoted(newName)
  if (quotedNew && quotedNew.rest !== '') return
  const path = quotedNew ? quotedNew.path : newName
  if (!path.startsWith('b/')) return
  return path.slice(2)
}

const startsFile = (lines: string[], index: number) => gitPath(lines[index]!) !== undefined || (lines[index]!.startsWith('--- ') && lines[index + 1]?.startsWith('+++ ') === true)

/** The files of a unified patch, or `undefined` when the text is not one. */
export const parsePatch = (text: string): PatchFile[] | undefined => {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  if (lines.at(-1) === '') lines.pop()
  let index = 0
  while (index < lines.length && !startsFile(lines, index)) index++
  const files: PatchFile[] = []
  // Whether the file last opened by a `diff --git` line still waits for its `---`/`+++` names
  let named = true
  while (index < lines.length) {
    const line = lines[index]!
    const current = files.at(-1)
    // `git format-patch` ends with its version under a signature line
    if (line === '-- ') break
    const git = gitPath(line)
    if (git !== undefined) {
      files.push({ path: git, lines: [] })
      named = false
      index++
      continue
    }
    if (line.startsWith('--- ') && lines[index + 1]?.startsWith('+++ ')) {
      const path = fileName(lines[index + 1]!) ?? fileName(line) ?? ''
      // They are the waiting file's when they name it, or a name with ` b/` in it, which a plain `diff --git` line splits at
      // its last ` b/`; otherwise a file without them, such as a rename alone, came before
      const theirs = !named && current !== undefined && (path === current.path || path.endsWith(` b/${current.path}`))
      if (theirs) current.path = path
      else files.push({ path, lines: [] })
      named = true
      index += 2
      continue
    }
    if (current && current.lines.length === 0 && extendedHeader.test(line)) {
      index++
      continue
    }
    const hunk = hunkHeader.exec(line)
    if (!current || !hunk) return
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
