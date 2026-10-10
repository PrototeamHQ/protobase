export type DiffLine = { kind: 'add' | 'del' | 'ctx'; text: string; oldNo?: number; newNo?: number }

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
