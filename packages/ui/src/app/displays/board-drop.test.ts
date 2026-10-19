import { describe, expect, it } from 'vitest'
import { dropWrite } from './board-drop'

describe('dropWrite', () => {
  const doing = async () => undefined
  const drop = { doing }

  it('gives the write of a column the drop names', () => {
    expect(dropWrite(drop, 'doing')).toBe(doing)
  })

  it('gives none for another column, the column without a value, or an inherited name', () => {
    expect(dropWrite(drop, 'done')).toBeUndefined()
    expect(dropWrite(drop, null)).toBeUndefined()
    expect(dropWrite(drop, 'toString')).toBeUndefined()
  })
})
