import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import type { GridRow } from './column-spec'
import { isMoveKey, movedCell, nextEditable, type CellPlace } from './cell-moves'

/** Cells edited in place: a double-click, a click on the chosen cell, Enter or F2 opens the cell's editor. */
export type CellEditor = {
  /** Whether this row's cell of `column` is edited in place. */
  editable: (row: GridRow, column: string) => boolean
  /**
   * The editor in the cell. It calls `close` once it saved or gave up, with `move` to go on to the next (`1`) or the
   * previous (`-1`) editable cell of the row.
   */
  render: (row: GridRow, column: string, close: (move?: 1 | -1) => void) => ReactNode
}

type Options = {
  editor: CellEditor | undefined
  columns: readonly string[]
  total: number
  /** The loaded row at an index, undefined while it loads. */
  rowAt: (index: number) => GridRow | undefined
  onOpenRow?: (row: GridRow) => void
  container: RefObject<HTMLElement | null>
}

const placeId = (place: CellPlace) => `${place.index}:${place.column}`

/**
 * The chosen cell and the one being edited, of a grid with an editor. The arrow keys, and Tab and Shift+Tab within a
 * row, move between cells; Enter opens the editor of an editable cell and the row of any other; Escape lets go of the
 * cell. A cell's mouse and keyboard handlers come from `cell`.
 */
export const useCellEditing = ({ editor, columns, total, rowAt, onOpenRow, container }: Options) => {
  const [active, setActive] = useState<CellPlace>()
  const [editing, setEditing] = useState(false)
  // A move by key or a closed editor brings the focus to the chosen cell; a scroll or a load does not take it.
  const refocus = useRef(false)
  // Whether the cell was already chosen when the pointer went down on it, before the focus chose it
  const pressedChosen = useRef(false)

  useEffect(() => {
    if (!active || editing || !refocus.current) return
    refocus.current = false
    const cell = container.current?.querySelector<HTMLElement>(`[data-cell="${placeId(active)}"]`)
    if (!cell) return
    cell.focus({ preventScroll: true })
    cell.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [active, editing, container])

  if (!editor) return undefined

  const editableAt = (place: CellPlace) => {
    const row = rowAt(place.index)
    return row !== undefined && editor.editable(row, place.column)
  }
  const choose = (place: CellPlace, edit = false) => {
    refocus.current = true
    setActive(place)
    setEditing(edit && editableAt(place))
  }
  const close = (move?: 1 | -1) => {
    if (!active) return
    const row = rowAt(active.index)
    const next = move && row ? nextEditable(active.column, columns, (column) => editor.editable(row, column), move) : undefined
    // An editor closed by a click elsewhere leaves the focus where the click put it
    const focused = Boolean(container.current?.contains(document.activeElement))
    choose(next ? { ...active, column: next } : active, next !== undefined)
    refocus.current = focused
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (editing || !active || !(event.target instanceof HTMLElement) || event.target.dataset.cell !== placeId(active)) return
    const key = event.key === 'Tab' ? (event.shiftKey ? 'ArrowLeft' : 'ArrowRight') : event.key
    if (isMoveKey(key)) {
      const next = movedCell(active, key, columns, total)
      // Tab leaves the grid at the end of the row; an arrow stays on the edge, and on a row still loading
      if (!next && event.key === 'Tab') return
      event.preventDefault()
      if (next && rowAt(next.index)) choose(next)
      return
    }
    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault()
      const row = rowAt(active.index)
      if (editableAt(active)) choose(active, true)
      else if (event.key === 'Enter' && row) onOpenRow?.(row)
      return
    }
    if (event.key === 'Escape') setActive(undefined)
  }

  /** What a cell of the grid needs: its content, its handlers, and whether it is chosen or being edited. */
  const cell = (index: number, row: GridRow, column: string, content: ReactNode) => {
    const place = { index, column }
    const chosen = active?.index === index && active.column === column
    const editable = editor.editable(row, column)
    // The chosen cell takes Tab into the grid; without one, the first cell of the first row does
    const reachable = chosen || (!active && index === 0 && column === columns[0])
    return {
      content: chosen && editing ? editor.render(row, column, close) : content,
      chosen,
      editing: chosen && editing,
      editable,
      props: {
        'data-cell': placeId(place),
        tabIndex: reachable ? 0 : -1,
        'aria-selected': chosen,
        onMouseDown: () => {
          pressedChosen.current = chosen
        },
        onFocus: (event: { target: EventTarget; currentTarget: EventTarget }) => {
          if (event.target === event.currentTarget && !chosen) setActive(place)
        },
        // An editable cell is chosen by a click instead of opening its row, and edited by a second one
        onClick: (event: { stopPropagation: () => void }) => {
          if (!editable) return
          event.stopPropagation()
          if (pressedChosen.current && !editing) choose(place, true)
        },
        onDoubleClick: (event: { stopPropagation: () => void }) => {
          if (!editable) return
          event.stopPropagation()
          if (!(chosen && editing)) choose(place, true)
        },
      },
    }
  }

  return { cell, onKeyDown }
}
