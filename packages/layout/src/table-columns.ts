/** A table column: a field name, or a field with its `priority`, 1 the most important, for which columns a phone shows. */
export type TableColumn = string | { name: string; priority: number }

/** What a column's definition says about it, from which its priority is derived when the table gives none. */
export type ColumnTraits = { title?: boolean; badge?: boolean }

/** How many columns a table shows at mobile width. */
export const phoneColumnCount = 3

export const columnName = (column: TableColumn) => (typeof column === 'string' ? column : column.name)

const givenPriority = (column: TableColumn) => (typeof column === 'string' ? undefined : column.priority)

// The derived rank of a column without a priority: the record's title, then badges such as an enum's, then the rest
const derivedRank = ({ title, badge }: ColumnTraits) => {
  if (title) return 0
  if (badge) return 1
  return 2
}

/**
 * The table's column names, most important first: the columns with a priority, lowest number first, then the others
 * by the derived rule (the title, then badge columns, then the rest); ties keep the table's order.
 */
export const columnsByPriority = (columns: TableColumn[], traits: (name: string) => ColumnTraits): string[] => {
  const ranked = columns.map((column, index) => ({ name: columnName(column), given: givenPriority(column), derived: derivedRank(traits(columnName(column))), index }))
  return ranked
    .sort((a, b) => {
      if (a.given !== undefined && b.given !== undefined) return a.given - b.given || a.index - b.index
      if (a.given !== undefined) return -1
      if (b.given !== undefined) return 1
      return a.derived - b.derived || a.index - b.index
    })
    .map(({ name }) => name)
}

/**
 * The column names a table shows at mobile width, in the table's order: when it gives priorities, the columns with one;
 * otherwise all columns. Of those, the `phoneColumnCount` most important by `columnsByPriority`.
 */
export const phoneColumns = (columns: TableColumn[], traits: (name: string) => ColumnTraits): string[] => {
  const prioritized = columns.filter((column) => givenPriority(column) !== undefined)
  const candidates = prioritized.length > 0 ? prioritized : columns
  const shown = new Set(columnsByPriority(candidates, traits).slice(0, phoneColumnCount))
  return columns.map(columnName).filter((name) => shown.has(name))
}
