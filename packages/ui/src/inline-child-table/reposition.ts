export type PositionStep = { id: string; position: number }

/**
 * The writes that move line `from` to index `to` when positions are unique per document. Only the lines between
 * the two indexes change. The moved line is parked past the end first, the lines in between shift one place into the
 * gap that opens, and the moved line then takes its final position, so no write ever clashes with another line.
 * `lines` must be in position order.
 */
export const planMove = (lines: ReadonlyArray<{ id: string; position: number }>, from: number, to: number): PositionStep[] => {
  const moved = lines[from]
  if (!moved || from === to || to < 0 || to >= lines.length) return []
  const parked = Math.max(...lines.map((line) => line.position)) + 1
  const shifted =
    from < to
      ? lines.slice(from + 1, to + 1).map((line, offset) => ({ id: line.id, position: lines[from + offset]!.position }))
      : lines
          .slice(to, from)
          .reverse()
          .map((line, offset) => ({ id: line.id, position: lines[from - offset]!.position }))
  return [{ id: moved.id, position: parked }, ...shifted, { id: moved.id, position: lines[to]!.position }]
}
