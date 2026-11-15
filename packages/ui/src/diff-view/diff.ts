export type DiffLine = { kind: 'add' | 'del' | 'ctx' | 'hunk'; text: string; oldNo?: number; newNo?: number }

export const parseDiff = (source: string, start = 1): DiffLine[] => {
  let oldNo = start
  let newNo = start
  return source.split('\n').map((raw) => {
    if (raw.startsWith('+')) return { kind: 'add', text: raw.slice(1), newNo: newNo++ }
    if (raw.startsWith('-')) return { kind: 'del', text: raw.slice(1), oldNo: oldNo++ }
    return { kind: 'ctx', text: raw.startsWith(' ') ? raw.slice(1) : raw, oldNo: oldNo++, newNo: newNo++ }
  })
}

export const diffStats = (lines: DiffLine[]) => ({
  added: lines.filter((line) => line.kind === 'add').length,
  removed: lines.filter((line) => line.kind === 'del').length,
})

/** One row of a side-by-side diff: the old line on the left, the new one on the right, or a hunk's header across both. */
export type SplitRow = { kind: 'hunk'; text: string } | { kind: 'pair'; old?: DiffLine; new?: DiffLine }

/** Lines side by side: context on both sides, and each run of removed lines beside the added lines that follow it. */
export const splitRows = (lines: DiffLine[]): SplitRow[] => {
  const rows: SplitRow[] = []
  let removed: DiffLine[] = []
  let added: DiffLine[] = []
  const flush = () => {
    for (let index = 0; index < Math.max(removed.length, added.length); index++) rows.push({ kind: 'pair', old: removed[index], new: added[index] })
    removed = []
    added = []
  }
  for (const line of lines) {
    if (line.kind === 'del') {
      if (added.length > 0) flush()
      removed.push(line)
      continue
    }
    if (line.kind === 'add') {
      added.push(line)
      continue
    }
    flush()
    rows.push(line.kind === 'hunk' ? { kind: 'hunk', text: line.text } : { kind: 'pair', old: line, new: line })
  }
  flush()
  return rows
}
